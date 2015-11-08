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

/** @fileOverview Logic for forager popup */

/**
* flag is set to true if popup is opened by page action icon click
*/
var isPageAction = false;

/**
* flag is set to true if popup is opened for tab with clinical wiki content
*/
var hasWiki = false;

/**
* Helper function to show donation label based on proivded state
*
* @param {bool} donationState to update
*/
function updateDonationLabel(donationState) {
    $("#labelDonateNone").toggle(donationState == undefined);
    $("#labelDonateOn").toggle(donationState);
    $("#labelDonateOff").toggle(donationState == false);
}

/**
* Helper function to adjust popup height based on its content
*/
function fixHeight() {
    if (isPageAction) {
        $("html").css("height", $(".container").height());
    } else {
        chrome.runtime.sendMessage({ 
            message: "setPopupHeight",
            height: $(".container").height()
        });
    }
}

/**
* Page initialization code
*/
$(document).ready(function() {
    chrome.runtime.sendMessage({ message: "initForagerPopup"}, function(response) {
        isPageAction = response.isPageAction;
        hasWiki = response.hasWiki;
        $(".wiki-caption").text(response.title);
        if (response.donationState == undefined) {
            $("#donate").prop("disabled", true);
        }
        $("#donate").prop('checked', !!response.donationState);
        $(".page-action-comment-block").toggle(isPageAction);
        $(".popup-comment-block").toggle(!isPageAction);
        updateDonationLabel(response.donationState);
        $(".comment-block").toggle(response.donationState && hasWiki);
        var options = {
            onColor: 'success',
            offColor: 'danger',
            animate: true,
            onSwitchChange: function(event, state) {
                updateDonationLabel(state);
                $(".comment-block").slideToggle({
                    progress: function() {
                        fixHeight();
                    }
                });
                chrome.runtime.sendMessage({ message: "toggleDonation", state: state });
            }
        };
        $("#donate").bootstrapSwitch(options);
        fixHeight();
    });
    
    $("#buttonClose").bind("click", function() {
        chrome.runtime.sendMessage({ message: "hidePopup"});
        if (isPageAction) {
            window.close();
        }
    });

    $("#buttonSave").bind("click", function() {
        var comment = $("#comment").val();
        if (comment.length > 20) {
            var data = {};
            data.message = "postForager";
            data.comment = comment;
            chrome.runtime.sendMessage(data);
            $(".comment-block").toggle(false);
            $(".submit-block").toggle(true);
            fixHeight();
            if (isPageAction) {
                $("html").fadeOut(POPUP_SEND_HIDE_DELAY_MS, function() {
                    window.close();
                });
            }
        } else {
            $(".comment-block .alert").show();
            fixHeight();
        }
    });
});

