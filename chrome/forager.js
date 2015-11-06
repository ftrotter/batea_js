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

var closeWindow = false;

$(document).ready(function() {
    chrome.runtime.sendMessage({ message : "initForagerPopup"}, function(response) {
        closeWindow = response.closeWindow;
        $("#wikiCaption").text(response.title);
        if (response.donationState == undefined) {
            $("#donate").prop("disabled", true);
        }
        $("#donate").prop('checked', !!response.donationState);
        $("#labelDonateNone").toggle(response.donationState == undefined);
        $("#labelDonateOn").toggle(response.donationState);
        $("#labelDonateOff").toggle(response.donationState == false);
        //$("#donate").bootstrapSwitch();
    });
    
    $("#buttonClose").bind("click", function() {
        chrome.runtime.sendMessage({ message : "hidePopup"});
        if (closeWindow) {
            window.close();
        }
    });

    // assign handler to Save button
    $("#buttonSave").bind("click", function() {
        var data = {};
        data.message = "postForager";
        data.comment = $("#comment").val();
        chrome.runtime.sendMessage(data);
    });

    $("#donate").on("change", function() {
        var state = $(this).prop('checked');
        updateDonateLabel(state);
        chrome.runtime.sendMessage({ message : "toggleDonation", state: state });
    });
});

