/** @license
 *
 * This file is part of DocGraph Spade Chrome extension
 *
 * @copyright 2014, The DocGraph Journal.
 * All rights reserved.
 * http://spade.docgraph.org
 *
 * @author Andrey Ivanov <andrey.v.ivanov@gmail.com>
 *
 */

/** @fileOverview Logic for options page */

$(document).ready(function() {
    // Just fills token id value into text field
	var processor = chrome.extension.getBackgroundPage().processor;
	$("#textID").val(processor.Id);
	
    // And assign handler to Save button
	$("#buttonSave").bind("click", function() {
		processor.setId($("#textID").val());
		window.close();
	});
});
