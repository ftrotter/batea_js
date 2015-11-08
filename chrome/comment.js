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


/**
* global object with form initialization data, could be used to update popup 
* state and send comment back to webserver
*/
var initData = {};

/**
* global flag to avoid second comment part expansion by click.
* Second click adds scrollbar to popup becuase height is not calualated correctly.
*/
var expanded = false;

/**
* Helper function to get short version of selection text to fit into popup
*
* @param {string} full text
* @return {string} truncated text
*/
function getShortText(longText) {
    var textLengthLimit = POPUP_SHORT_COMMENT_LENGTH;
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

/**
* Helper function to adjust popup height based on its content
*/
function fixHeight() {
    chrome.runtime.sendMessage({ message: "setPopupHeight", height: $(".container").height() });
}

/**
* Page initialization code
*/
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
