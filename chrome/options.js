/** @license
 *
 * This file is part of DocGraph Batea Chrome extension
 *
 * @copyright 2014-2015, The DocGraph Journal.
 * All rights reserved.
 * http://batea.docgraph.org
 *
 * @author Fred Trotter <fred.trotter@gmail.com>
 * @author Andrey Ivanov <andrey.v.ivanov@gmail.com>
 *
 */

/** @fileOverview Logic for options page */

$(document).ready(function() {
    var processor = chrome.extension.getBackgroundPage().processor;

    $(".av_section_scholar").toggle(processor._consented);
    $("#av_section_scholar form").attr('action', ANONYMOUS_URI);
    $(".av_section_anonymous").toggle(!processor._consented);
    $("#av_section_anonymous form").attr('action', CONSENT_URI);

    $("#recordAnyWiki").prop('checked', !processor.checkClinicalOnlyWiki());
    $("#recordClinicalWiki").prop('checked', processor.checkClinicalOnlyWiki());

    $("#popupAllow").prop('checked', processor.isPopupAllowed());
    $("#popupDisable").prop('checked', !processor.isPopupAllowed());

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
        window.close();
    });

    $("#buttonScholar").bind("click", function() {
        window.close();
    });

    // Just fills token id value into debug text field
    $("#userId").val(processor.Id);
});
