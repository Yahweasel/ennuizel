/*
 * Copyright (c) 2019 Yahweasel 
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

// libav's source
var libavSrc = "libav/libav-2.2.4.3.1-fat.js";

// The maximum size to read from a file in one gulp
var maxReadSize = 8*1024*1024;

// The maximum size of a fragment store in our DB, in seconds
var maxFragment = 60;

// Utility functions
function randomId() {
    return Math.random().toString(36).slice(2);
}

// Library loading as a promise
function loadLibrary(src) {
    return new Promise(function(res, rej) {
        var scr = dce("script");
        scr.onload = res;
        src.onerror = rej;
        scr.src = src;
        scr.async = true;
        document.body.appendChild(scr);
    });
}

// Do our initial main steps
var persistence = false;
Promise.all([]).then(function() {
    // Load our locale
    return loadLocale();

}).then(function() {
    // Now that we have our locale, load the menu
    loadMenu();

    // And show it
    showMenu();

    // Load all our libraries
    if (typeof LibAV === "undefined") LibAV = {};
    LibAV.base = "libav";
    return Promise.all([
        loadLibrary(libavSrc),
        loadLibrary("localforage.min.js"),
        loadLibrary("web-streams-ponyfill.js")
    ]).then(function() {
        return loadLibrary("StreamSaver.js?v=3")
    });

}).then(function() {
    streamSaver.mitm = "StreamSaver/mitm.html";

    /* The technique to get persistence (which also implies larger/no quota) is
     * complicated. On Firefox, if you request persitence, it will simply pop
     * up a dialog asking the user for persistence. On Chrome, no such dialog
     * exists, and instead it's a convoluted mess of "if the page has this
     * other property, I'll give them persistence". To deal with this, we:
     * (1) Ask for persistence
     * (2) If we don't have persistence, ask for notifications, which are one
     *     feature that Chrome will turn into persistence permission
     * (3) Ask for persistence again
     */
    if (navigator.storage && navigator.storage.persisted)
        return navigator.storage.persisted();
    return false;

}).then(function(ret) {
    persistence = ret;

    if (!persistence && navigator.storage && navigator.storage.persist) {
        return warn(l("persistence")).then(function() {
            return navigator.storage.persist();
        });
    }
    return persistence;

}).then(function(ret) {
    persistence = ret;

    if (!persistence && typeof Notification !== "undefined" && Notification.requestPermission)
        return Notification.requestPermission();
    return false;

}).then(function(notif) {
    if (!persistence && notif && navigator.storage && navigator.storage.persist)
        return navigator.storage.persist();
    return persistence;

}).then(function(ret) {
    persistence = ret;

    if (!persistence)
        return warn(l("persistenceno"));

}).then(function(ret) {
    // We can only define our export formats once we have libav loaded
    return setExportFormats();

}).then(function() {
    // Load any plugins
    var p = Promise.resolve(true);
    if (ez.plugins) {
        ez.plugins.forEach(function(plugin) {
            p = p.then(plugin);
        });
    }

    return p.then(startup);

}).catch(error);

// Initial startup code
function startup(full) {
    // Get our projects list
    if (!dbGlobal)
        ez.dbGlobal = dbGlobal = localforage.createInstance({name:"ennuizel-global"});

    if (full)
        return restart();
    else
        return Promise.all([]);
}
ez.startup = startup;

// Common startup/restart code
function restart() {
    var projects;
    return dbGlobal.getItem("projects").then(function(ret) {
        if (ret === null) ret = [];
        projects = ret;

        return modalWait();

    }).then(function(unlock) {
        // List the projects in the modal dialog
        modalDialog.innerHTML = "";

        mke(modalDialog, "label", {text: l("project") + ": ", "for": "projectselect"});

        var select = mke(modalDialog, "select", {id: "projectselect"});

        var option = mke(select, "option", {text: l("selecte")});
        option.value = "none";
        option.selected = true;
        projects.forEach(function(project) {
            var option = mke(select, "option", {text: project});
            option.value = "project:" + project;
        });
        option = mke(select, "option", {text: l("new")});
        option.value = "new";

        modalToggle(true);
        select.focus();

        return new Promise(function(res, rej) {
            select.onchange = function() {
                if (select.value === "none") return;
                unlock();
                res(select.value);
            };
        });

    }).then(function(project) {
        var pnm = /^project:(.*)/.exec(project);
        if (pnm) {
            ez.projectName = projectName = pnm[1];
            return loadProject();

        } else {
            return newProjectDialog();

        }

    });
}
