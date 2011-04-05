/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/iteratorUtils.jsm"); // for fixIterator
Cu.import("resource://rsstab/log.js");

const kMaxMessages = 5;
const kXulNs = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let Log = setupLogging("RssTab.UI");

let folderToDiv = {};

function createFeedDiv(aTitle, aElements) {
  let div = document.createElement("div");
  div.classList.add("listContainer");
  div.classList.add("c2");
  div.classList.add("border");
  let h2 = document.createElement("h2");
  h2.textContent = aTitle;
  let innerDiv = document.createElement("div");
  innerDiv.classList.add("d2");
  div.appendChild(h2);
  div.appendChild(innerDiv);
  let ol = document.createElement("ol");
  innerDiv.appendChild(ol);

  let tabmail = window.top.document.getElementById("tabmail");
  for each (let [, o] in Iterator(aElements)) {
    let { msgHdr, title } = o;
    let li = document.createElement("li");
    let hbox = document.createElementNS(kXulNs, "xul:hbox");
    let label = document.createElementNS(kXulNs, "xul:label");
    label.setAttribute("crop", "end");
    label.setAttribute("flex", "1");
    label.setAttribute("value", title);
    label.addEventListener("click", function (event) {
      tabmail.openTab("message", {
        msgHdr: msgHdr,
        background: true,
      });
      li.classList.remove("unread");
    }, false);
    if (!msgHdr.isRead)
      li.classList.add("unread");
    hbox.appendChild(label);
    li.appendChild(hbox);
    ol.appendChild(li);
  }

  let mainDiv = document.getElementsByClassName("listRow")[0];
  mainDiv.appendChild(div);
}

function listMessages(aFolder) {
  let database = aFolder.msgDatabase;
  let messages = [];
  let i = 0;
  for each (let msgHdr in fixIterator(database.EnumerateMessages(), Ci.nsIMsgDBHdr)) {
    let title = msgHdr.mime2DecodedSubject;
    messages.push({
      title: title,
      msgHdr: msgHdr,
    });
    if (i >= kMaxMessages)
      break;
    i++;
  }
  // hehe don't forget to close the database
  aFolder.msgDatabase = null;
  createFeedDiv(aFolder.prettiestName, messages);
}

function findFolders(aFolder) {
  let allFolders = Cc["@mozilla.org/supports-array;1"]
                   .createInstance(Ci.nsISupportsArray);
  aFolder.ListDescendents(allFolders);
  for each (let folder in fixIterator(allFolders, Ci.nsIMsgFolder)) {
    if (!(folder.flags & Ci.nsMsgFolderFlags.Trash))
      listMessages(folder);
  }
}

function fillBuckets() {
  let accounts = MailServices.accounts.accounts;
  for each (let account in fixIterator(accounts, Ci.nsIMsgAccount)) {
    if (account.incomingServer instanceof Ci.nsIRssIncomingServer) {
      findFolders(account.incomingServer.rootFolder);
    }
  }
}

window.addEventListener("load", function () {
  fillBuckets();
  //registerListener();
  window.frameElement.setAttribute("context", "mailContext"); // ARGH
}, false);
