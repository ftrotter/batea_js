/** @license
 *
 * This file is part of DocGraph Batea Chrome extension
 *
 * @copyright 2014-2015, The DocGraph Journal.
 * All rights reserved.
 * http://batea.docgraph.com
 *
 * @author Fred Trotter <fred.trotter@gmail.com>
 * @author Andrey Ivanov <andrey.v.ivanov@gmail.com>
 *
 */

/** @fileOverview Logic for options page */

/**
* Helper function to show bootstrap validation states for passed node
*
* @param {jquery node} node to process
* @param {bool} success state is mapped to has-success class and glyphicon-ok 
*                       or to has-error and glyphicon-remove in case of failure
*/
function addFormValidation(node, success) {
    var form = node.parent();
    form.remove(".form-control-feedback");
    if (success) {
        form.removeClass("has-error");
        form.append('<span class="glyphicon glyphicon-ok form-control-feedback"></span>');
        form.addClass('has-success has-feedback');
    } else {
        form.removeClass("has-success");
        form.append('<span class="glyphicon glyphicon-remove form-control-feedback"></span>');
        form.addClass('has-error has-feedback');
    }
}

/**
* Helper function to update page controls to reflect updated consent state
*
* @param {bool} consented user state
*/
function updateConsentedState(consented) {
    $(".av_section_scholar").toggle(consented);
    $(".av_section_anonymous").toggle(!consented);
}

/**
* Helper function to send user choice as settings
*/
function saveTheseSettings() {
    var settings = {};
    var selected = $("input[name='involved']:checked");
    if (selected.length > 0) {
        settings.delivering_clinical_care = selected.parent().text().trim();
    }
    selected = $("input[name='care']:checked");
    if (selected.length > 0) {
        settings.receiving_clinical_care = selected.parent().text().trim();
    }
    console.log('about to send all my settings to saveSetting');
    chrome.extension.getBackgroundPage().processor.saveSettings(settings);
}

/**
* Page initialization code
*/
$(document).ready(function() {
    var processor = chrome.extension.getBackgroundPage().processor;
    $(".av_section_anonymous a").attr('href', CONSENT_URI.replace("{0}", processor.Id));
    updateConsentedState(processor._consented);
    // We can open this page right after consent form.
    // Update _consented state from webserver and reflect UI changes
    processor.updateStates(function() {
        updateConsentedState(processor._consented);
    })

    $("#recordAnyWiki").prop('checked', !processor.checkClinicalOnlyWiki());
    $("#recordClinicalWiki").prop('checked', processor.checkClinicalOnlyWiki());

    $("#popupAllow").prop('checked', processor.isPopupAllowed());
    $("#popupDisable").prop('checked', !processor.isPopupAllowed());

    $(".subscribe-form").toggle(!processor.emailProvided());

    $("input[name='record']").on("change", function () {
        if (this.value == "any") {
            processor.setCheckClinicalOnlyWiki(false);
        } else if (this.value == "clinical") {
            processor.setCheckClinicalOnlyWiki(true);
        }
    })

    $("input[name='popup']").on("change", function () {
        if (this.value == "allow") {
            processor.setAllowPopup(true);
        } else if (this.value == "disable") {
            processor.setAllowPopup(false);
        }
    })

    $("#buttonAnonymous").bind("click", function() {
        processor._consented = localStorage.consented = false;
        var data = { is_consented: false };
        $("#buttonAnonymous span").show();
        processor.saveSettings(data, function(success) {
            $("#buttonAnonymous span").hide();
            updateConsentedState(false);
        });
    });

    $("input[name='involved']").on("change", function () {
        saveTheseSettings();
    });

    $("input[name='care']").on("change", function () {
        saveTheseSettings();
    });

    $("#buttonScholar").bind("click", function() {
        saveTheseSettings();
    });

    $("#subscribe").click(function() {
        if ($('#email')[0].checkValidity()) {
            var data = { email: $("#email").val() };
            $("#subscribe span").show();
            processor.saveSettings(data, function(success) {
                addFormValidation($("#email"), success);
                if (success) {
                    $("#email").prop('disabled', success);
                    $("#subscribe").hide();
                } else {
                    $("#subscribe span").hide();
                }
            });
        }
    });
});
