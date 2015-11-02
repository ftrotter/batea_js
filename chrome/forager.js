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

/** @fileOverview Logic for forager form */

var closeWindow = false;

$(document).ready(function() {
    chrome.runtime.sendMessage({ message : "initForagerPopup"}, function(response) {
        closeWindow = response.closeWindow;
        $("#wikiCaption").text(response.title);
        if (response.donationState == undefined) {
            $("#labelDonate").text("Browser data is not being donated");
            $("#donate").prop('checked', false);
            $("#donate").prop("disabled", true);
        } else if (response.donationState) {
            $("#labelDonate").text("Currently donating browser data");
            $("#donate").prop('checked', true);
        } else {
            $("#labelDonate").text("Cancelled donating browser data");
            $("#donate").prop('checked', false);
        }
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
        chrome.runtime.sendMessage({ message : "toggleDonation", state: $(this).prop('checked') });
    });
});

