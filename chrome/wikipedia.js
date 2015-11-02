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

/** @fileOverview wikipedia.org content script */

var selectionProcessingTimeoutId = null;

function getTitle() {
    return JSON.parse(getMwConfig())["wgTitle"];
}

function getMwConfig() {
    var script = $("head script").text();
    var start = script.indexOf("mw.config.set({");
    if (start >= 0) {
        start += 14;
        var end = script.indexOf("});", start);
        return script.substr(start, end - start + 1);
    }
    return "{}";
}

$(document).on('selectionchange', function(e) {
    if (selectionProcessingTimeoutId != null) {
        clearTimeout(selectionProcessingTimeoutId);
    }
    selectionProcessingTimeoutId = setTimeout(function() {
        selectionProcessingTimeoutId = null;
        selection = window.getSelection().toString();
        if (selection.length > 0) {
            var config = getMwConfig();
            var title = getTitle();
            chrome.runtime.sendMessage({
                message : "popupWikiComment",
                selection : selection,
                title : title,
                config : config
            });
        } else {
            console.log("empty selection");
        } 
    }, COMMENT_POPUP_DELAY_MS);
});

$(document).ready(function() {
    var config = getMwConfig();
    var title = getTitle();
    chrome.runtime.sendMessage({
        message : "setWikiContent",
        title : title,
        config : config
    });
});
