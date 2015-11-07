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
var expanded = false;

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

function fixHeight() {
    chrome.runtime.sendMessage({ message: "setPopupHeight", height: $(".container").height() });
}

$(document).ready(function() {
    chrome.runtime.sendMessage({ message: "initCommentPopup"}, function(response) {
        initData = response;
        $("#wikiCaption").text(initData.title);
        $("#selectionText").text(getShortText(initData.selection));
        $("#selectionText").click(function() {
            if (!expanded) {
                $("#selectionText").text(initData.selection);
                fixHeight();
                expanded = true;
            }
        });
        fixHeight();
    });

    $("#buttonClose").bind("click", function() {
        chrome.runtime.sendMessage({ message: "hidePopup"});
    });

    $("#buttonSave").bind("click", function() {
        var comment = $("#comment").val();
        if (comment.length > 20) {
            var data = {};
            initData.message = "postComment";
            initData.comment = comment;
            chrome.runtime.sendMessage(initData);
            $(".comment-block").toggle(false);
            $(".submit-block").toggle(true);
            fixHeight();
        } else {
            $(".comment-block .alert").show();
            fixHeight();
        }
    });

});
