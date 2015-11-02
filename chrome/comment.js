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

/** @fileOverview Logic for comment page */

var initData = {};

function getShortText(longText) {
    var textLengthLimit = 100;
    var textLengthSuffixLength = textLengthLimit / 5;
    if (longText.length < textLengthLimit) {
        return longText;
    }
    var lastIndex = longText.lastIndexOf(" ", longText.length - textLengthSuffixLength);
    if (lastIndex > 0) {
        var firstIndex = longText.lastIndexOf(" ", textLengthLimit - longText.length + lastIndex);
        if (firstIndex > 0) {
            return longText.substr(0, firstIndex) + "..." + longText.substr(lastIndex);
        }
    }

    return longText;
}

$(document).ready(function() {
    chrome.runtime.sendMessage({ message : "initCommentPopup"}, function(response) {
        initData = response;
        $("#wikiCaption").text(initData.title);
        $("#selectionText").text(getShortText(initData.selection));
        $("#selectionText").click(function() {
            $("#selectionText").text(initData.selection);
        });
    });

    $("#buttonClose").bind("click", function() {
        chrome.runtime.sendMessage({ message : "hidePopup"});
    });

    // assign handler to Save button
    $("#buttonSave").bind("click", function() {
        initData.message = "postComment";
        initData.comment = $("#comment").val();
        chrome.runtime.sendMessage(initData);
        $("#buttonSave").text("Sending");
    });
});
