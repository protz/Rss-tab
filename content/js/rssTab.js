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
Cu.import("resource://rsstab/stdlib/msgHdrUtils.js");
Cu.import("resource://rsstab/log.js");

const kMaxMessages = 5;
const kXulNs = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let Log = setupLogging("RssTab.UI");

let folderToFeed = {};
let gAnimating = false;

let feedDownloader = Cc["@mozilla.org/newsblog-feed-downloader;1"]
                     .getService(Ci.nsINewsBlogFeedDownloader);

function folderToFeedUrls(aFolder) {
  return aFolder.msgDatabase.dBFolderInfo.getCharProperty("feedUrl");
}

function Feed (aFolder) {
  // Remember the folder we're representing.
  this.folder = aFolder;
  this.tabmail = window.top.document.getElementById("tabmail");

  // Output the thing!
  this.div = this.create();
  this.populate();
  this.updateUnreadCount();
}

Feed.prototype = {

  create: function _Feed_create() {
    let feedUrls = folderToFeedUrls(this.folder).split("|");
    let feedUrl = feedUrls[0] || feedUrls[1];
    let div = document.createElement("div");
    div.classList.add("listContainer");
    div.classList.add("c2");
    div.classList.add("border");
    let h2 = document.createElement("h2");
    let favicon = document.createElement("img");
    favicon.setAttribute("src", "http://getfavicon.appspot.com/" + encodeURI(feedUrl));
    h2.appendChild(favicon);
    h2.appendChild(document.createTextNode(this.folder.prettiestName));
    h2.classList.add("feedTitle");
    let span = document.createElement("span");
    let img = document.createElement("img");
    img.src = "chrome://rsstab/skin/unread.png";
    img.addEventListener("click", function (event) {
      if (event.button == 0) {
        this.markAllRead();
      }
    }.bind(this), false);
    span.appendChild(img);
    h2.appendChild(span);

    let innerDiv = document.createElement("div");
    innerDiv.classList.add("d2");
    div.appendChild(h2);
    div.appendChild(innerDiv);
    let ol = document.createElement("ol");
    innerDiv.appendChild(ol);

    let unreadDiv = document.createElement("div");
    unreadDiv.classList.add("unreadCount");
    div.appendChild(unreadDiv);

    let mainDiv = document.getElementsByClassName("listRow")[0];
    mainDiv.appendChild(div);

    return div;
  },

  populate: function _Feed_populate() {
    // Get the first few messages in that folder.
    let database = this.folder.msgDatabase;
    let messages = [];
    let oldest = 0;
    for each (let msgHdr in fixIterator(database.EnumerateMessages(), Ci.nsIMsgDBHdr)) {
      if (msgHdr.date > oldest) {
        messages.push(msgHdr);
      }
      if (messages.length > kMaxMessages) {
        messages.sort(function (x, y) x.date - y.date);
        oldest = messages.shift().date;
      }
    }
    let n = Math.min(kMaxMessages, messages.length);
    for (let i = 0; i < n; ++i)
      this.addItem(messages[i]);
    // And don't forget to close the database.
    this.folder.msgDatabase = null;
  },

  addItem: function _Feed_addItem(aMsgHdr) {
    let ol = this.div.getElementsByTagName("ol")[0];
    let li = document.createElement("li");
    let hbox = document.createElementNS(kXulNs, "xul:hbox");
    let label = document.createElementNS(kXulNs, "xul:label");
    label.setAttribute("crop", "end");
    label.setAttribute("flex", "1");
    label.setAttribute("value", aMsgHdr.mime2DecodedSubject);
    label.setAttribute("tooltiptext", aMsgHdr.mime2DecodedSubject);
    label.addEventListener("click", function (event) {
      msgHdrsMarkAsRead([aMsgHdr], true);
      this.tabmail.openTab("message", {
        msgHdr: aMsgHdr,
        background: event.button, // 1 is middle-click, 0 is left click
      });
      li.classList.remove("unread");
      this.updateUnreadCount();
    }.bind(this), false);
    if (!aMsgHdr.isRead)
      li.classList.add("unread");
    hbox.appendChild(label);
    li.appendChild(hbox);
    if (!ol.children.length)
      ol.appendChild(li);
    else
      ol.insertBefore(li, ol.firstElementChild);
  },

  addMessage: function _Feed_addMessage(aMsgHdr) {
    this.addItem(aMsgHdr);
    let ol = this.div.getElementsByTagName("ol")[0];
    // We added at most one message
    if (ol.children.length > kMaxMessages)
      ol.removeChild(ol.children[ol.children.length - 1]);
    this.updateUnreadCount();
    gAnimating = true;
  },

  updateUnreadCount: function _Feed_updateUnreadCount(aUnread) {
    let unreadDiv = this.div.querySelector(".unreadCount");
    unreadDiv.innerHTML = "";

    let totalUnread = this.folder.getNumUnread(true);
    let unread = totalUnread
      - this.div.getElementsByClassName("unread").length;
    if (unread > 0) {
      let a = document.createElement("a");
      a.textContent = "and " + unread + " more unread item"
        + (unread > 1 ? "s" : "");
      a.setAttribute("href", "javascript:");
      unreadDiv.appendChild(a);
      a.addEventListener("click", function (event) {
        this.tabmail.openTab("folder", {
          folder: this.folder,
          background: event.button, // 1 is middle-click, 0 is left click
        });
      }.bind(this), false);
    }

    if (totalUnread)
      this.div.classList.add("hasUnread");
    else
      this.div.classList.remove("hasUnread");
  },

  markAllRead: function _Feed_markAllRead() {
    this.folder.markAllMessagesRead(top.msgWindow);
    this.updateUnreadCount();
    let unread = this.div.getElementsByClassName("unread");
    for (let i = unread.length - 1; i >= 0; --i)
      unread[i].classList.remove("unread");
  },

}

function findFolders(aFolder) {
  let registered = false;
  let allFolders = Cc["@mozilla.org/supports-array;1"]
                   .createInstance(Ci.nsISupportsArray);
  aFolder.ListDescendents(allFolders);
  for each (let folder in fixIterator(allFolders, Ci.nsIMsgFolder)) {
    if (!(folder.flags & Ci.nsMsgFolderFlags.Trash)
        && !(folder.flags & Ci.nsMsgFolderFlags.Archive)) {
      folderToFeed[folder.URI] = new Feed(folder);
      Log.debug("New feed for", folder.URI);
      // Register the "manage subscriptions" action... we can't use the root
      // folder, I don't know why, so use the first one we find.
      if (!registered) {
        registered = true;
        document.getElementById("subscribe").addEventListener("click", function () {
          top.openSubscriptionsDialog(folder);
        }, false);
      }
    }
  }
}

function createAllFeeds() {
  let accounts = MailServices.accounts.accounts;
  for each (let account in fixIterator(accounts, Ci.nsIMsgAccount)) {
    if (account.incomingServer instanceof Ci.nsIRssIncomingServer) {
      findFolders(account.incomingServer.rootFolder);
    }
  }
}

function registerListener() {
  let listener = {
    msgAdded: function _listener_msgAdded(aMsgHdr) {
      let uri = aMsgHdr.folder.URI;
      if (uri in folderToFeed) {
        folderToFeed[uri].addMessage(aMsgHdr);
      }
    },
  };
  MailServices.mfn.addListener(listener, MailServices.mfn.msgAdded);
  window.addEventListener("unload", function () {
    MailServices.mfn.removeListener(listener, MailServices.mfn.msgAdded);
  }, false);
}

function registerAnimation() {
  window.addEventListener("mousemove", function () {
    gAnimating = false;
    document.title = "RSS Dashboard";
  }, false);
  (function animate(str) {
    if (gAnimating) {
      document.title = str;
      let c = str[0];
      str = str.substring(1, str.length);
      str += c;
    }
    setTimeout(function () animate(str), 100);
  })("New message(s)...     "); // the spaces in the string are U+00A0
}

window.addEventListener("load", function () {
  createAllFeeds();
  registerListener();
  registerAnimation();
  window.frameElement.setAttribute("context", "mailContext"); // ARGH
  window.frameElement.setAttribute("tooltip", "aHTMLTooltip"); // ARGH
}, false);
