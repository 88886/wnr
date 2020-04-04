const { app, BrowserWindow, ipcMain, Tray, Menu,
    globalShortcut, dialog, shell, powerSaveBlocker,
    powerMonitor, systemPreferences, Notification,
    nativeTheme, screen, TouchBar }
    = require('electron');
const Store = require('electron-store');
const path = require("path");
var i18n = require("i18n");
var Registry = require('winreg');
const windowsRelease = require('windows-release');
var cmdOrCtrl = require('cmd-or-ctrl');
var AV = require('leancloud-storage');
var { Query } = AV;
const { TouchBarLabel, TouchBarButton, TouchBarSpacer } = TouchBar

//keep a global reference of the objects, or the window will be closed automatically when the garbage collecting.
let win = null, settingsWin = null, aboutWin = null, tourWin = null,
    tray = null, contextMenu = null, settingsWinContextMenu = null,
    resetAlarm = null, powerSaveBlockerId = null,
    isTimerWin = null, isWorkMode = null, isChinese = null,
    timeLeftTip = null, predefinedTasks = null,
    pushNotificationLink = null,
    workTimeFocused = false, restTimeFocused = false,
    fullScreenProtection = false,
    leanId = null, leanKey = null,
    progress = -1, timeLeftOnBar = null,
    dockHide = false,
    newWindows = new Array, displays = null, hasMultiDisplays = null,
    store = null,
    isLoose = false;
let languageCodeList = ['en', 'zh-CN', 'zh-TW']//locale code

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')//to play sounds

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';//prevent seeing this meaningless alert

function createWindow() {
    //create the main window
    win = new BrowserWindow({
        width: 364,
        height: 396,
        frame: false,
        backgroundColor: "#fefefe",
        resizable: false,
        maximizable: false,
        show: false,
        hasShadow: true,
        webPreferences: { nodeIntegration: true, webgl: false },
        titleBarStyle: "hiddenInset",
        icon: "./res/icons/wnrIcon.png"
    });//optimize for cross platfrom

    //load index.html
    win.loadFile('index.html');

    //to load without sparking
    win.once('ready-to-show', () => {
        win.show();
        win.moveTop();
    });

    //triggers when the main windows is closed
    win.on('closed', () => {
        win = null;
        settingsWin = null;
        tourWin = null;
        aboutWin = null;
    });

    //triggers for macos lock
    win.on('close', (event) => {
        if ((store.get("islocked") || (fullScreenProtection && isTimerWin)) && app.isPackaged) {
            event.preventDefault();
            if (win != null)
                notificationSolution("wnr", i18n.__('prevent-stop'), "normal");
        }
    });

    //triggers for focusing
    /*win.on('blur', () => {
        win.maximizable = false;
        if (isTimerWin && fullScreenProtection && win != null) {
            win.hide();
            win.setKiosk(false);
            win.moveTop();
            win.setKiosk(true);
            win.show();
            if (!dockHide)
                notificationSolution(i18n.__('stop-now'), i18n.__('stop-now-msg'), "hide-or-show");//notify not to do meaningless things
        }
    });*/

    win.on('show', () => {
        if (isTimerWin) {
            if (win != null) {
                win.setProgressBar(progress);
            }
        }
    });

    //prevent app-killers for lock mode / focus mode
    win.webContents.on('crashed', () => {
        if (store.get('islocked') || (fullScreenProtection && isTimerWin && app.isPackaged && (!isLoose))) app.relaunch();
    });

    screen.on('display-added', (event, newDisplay) => {
        displays = screen.getAllDisplays();
        hasMultiDisplays = true;
        setTimeout(function () {
            if (fullScreenProtection && isTimerWin && (!isLoose)) {
                for (i in displays) {
                    if (displays[i].id == newDisplay.id) {
                        addScreenSolution(newWindows[i], newDisplay);
                    }
                }
            }
        }, 500);
    });

    screen.on('display-removed', () => {
        if (fullScreenProtection && isTimerWin && (!isLoose)) {
            multiScreenSolution("off");
            setTimeout(function () { multiScreenSolution("on"); }, 1500);
        }
    });
}

function alarmSet() {
    if (!resetAlarm) {
        resetAlarm = setInterval(function () {
            if (store.get('alarmtip') != false) {
                if (win != null) win.flashFrame(true);
                notificationSolution(i18n.__('alarm-for-not-using-wnr-dialog-box-title'),
                    i18n.__('alarm-for-not-using-wnr-dialog-box-content'),
                    "hide-or-show");
            }
        }, 600000)//alarm you for using wnr
    }
}

function setFullScreenMode(flag) {
    if (win != null) {
        if (!isLoose) win.setKiosk(flag);
        else if (process.platform == "darwin") win.setSimpleFullScreen(flag);
        else win.setFullScreen(flag);
    }
}

function addScreenSolution(objWindow, display) {
    objWindow = new BrowserWindow({
        width: 364,
        height: 396,
        x: display.bounds.x,
        y: display.bounds.y,
        frame: false,
        backgroundColor: "#fefefe",
        show: true,
        hasShadow: true,
        webPreferences: { nodeIntegration: true, webgl: false },
        titleBarStyle: "hiddenInset",
        icon: "./res/icons/wnrIcon.png",
        visibleOnAllWorkspaces: true
    });//optimize for cross platfrom

    objWindow.loadFile('placeholder.html');

    if (app.isPackaged) objWindow.setFocusable(false);
    objWindow.setFullScreen(true);
    objWindow.moveTop();
    objWindow.setAlwaysOnTop(true);
}
function multiScreenSolution(mode) {
    if (app.isReady()) {
        displays = screen.getAllDisplays();
        hasMultiDisplays = (displays.length > 1) ? true : false;
        for (i in displays) {
            if (displays[i].id != screen.getPrimaryDisplay().id) {
                if (mode == "on") {
                    addScreenSolution(newWindows[i], displays[i]);
                } else {
                    if (newWindows[i] != null) {
                        if (newWindows[i].isDestroyed() == false)
                            newWindows[i].destroy();
                    }
                }
            }
        }
    }
}

function touchBarSolution(mode) {
    if (app.isReady()) {
        if (process.platform == "darwin") {
            try {
                if (mode == "index") {
                    let settingsSubmitter = new TouchBarButton({
                        label: i18n.__('settings'),
                        click: () => settings()
                    });
                    let helperSubmitter = new TouchBarButton({
                        label: i18n.__('website'),
                        click: () => shell.openExternal('https://getwnr.com/')
                    });
                    let submitter = new TouchBarButton({
                        label: i18n.__('submitter'),
                        backgroundColor: '#5490ea',
                        click: () => win.webContents.send("submitter")
                    });
                    let touchBar = new TouchBar({
                        items: [
                            settingsSubmitter,
                            new TouchBarSpacer({ size: "small" }),
                            helperSubmitter,
                            new TouchBarSpacer({ size: "small" }),
                            submitter,
                        ]
                    });
                    if (win != null) win.setTouchBar(touchBar);
                } else if (mode == "timer") {
                    let startOrStopSubmitter = new TouchBarButton({
                        label: i18n.__('start-or-stop'),
                        click: () => win.webContents.send("start-or-stop")
                    });
                    timeLeftOnBar = new TouchBarLabel({
                        label: (1 - progress) * 100 + timeLeftTip
                    })
                    let touchBar = new TouchBar({
                        items: [
                            timeLeftOnBar
                        ]
                    });
                    touchBar.escapeItem = startOrStopSubmitter;
                    if (win != null) win.setTouchBar(touchBar);
                }
            } catch (e) {
                console.log(e)
            }
        }
    }
}

//before quit
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (tray != null) {
        tray.destroy(tray);
        tray = null
    }
})

//when created the app, triggers
//some apis can be only used inside ready
app.on('ready', () => {
    createWindow();

    if (process.env.PORTABLE_EXECUTABLE_DIR) {
        store = new Store({ cwd: process.env.PORTABLE_EXECUTABLE_DIR, name: 'wnr-config' });//accept portable
    } else store = new Store();

    require('dotenv').config();

    if (!app.isPackaged) {
        const debug = require('electron-debug');
        debug({ showDevTools: false });
    }

    i18n.configure({
        locales: languageCodeList,
        directory: __dirname + '/locales',
        register: global
    });
    if (store.get("i18n") == undefined) {
        var lang = app.getLocale();
        if (lang.indexOf("zh") != -1) {
            if ((lang.charAt(3) == 'T' && lang.charAt(4) == 'W') && (lang.charAt(3) == 'H' && lang.charAt(4) == 'K')) lang = 'zh-TW';
            else lang = 'zh-CN';
            isChinese = true;
        } else {
            for (i in languageCodeList) {
                if (lang.indexOf(languageCodeList[i]) != -1) {
                    lang = languageCodeList[i];
                    break;
                }
            }
            isChinese = false;
        }
        store.set('i18n', lang);
    } else {
        isChinese = store.get("i18n").indexOf("zh") != -1 ? true : false;
        if (store.get("i18n") == 'zh') {
            var lang = app.getLocale();
            if ((lang.charAt(3) == 'T' && lang.charAt(4) == 'W') && (lang.charAt(3) == 'H' && lang.charAt(4) == 'K')) lang = 'zh-TW';
            else lang = 'zh-CN';
            store.set('i18n', lang);
        }
    }
    i18n.setLocale(store.get("i18n"));//set the locale

    timeLeftTip = i18n.__("time-left");//this will be used in this file frequently

    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        console.log('Didn\'t get the lock, quitting');
        app.quit();
    } else {
        app.on('second-instance', () => {
            if (win != null) {
                if (win.isMinimized()) win.restore();
                if (!win.isVisible()) win.show();
                win.focus();
            }
        });
    }//prevent wnr from running more than one instance

    if (screen.getAllDisplays().length > 1) hasMultiDisplays = true;
    else hasMultiDisplays = false;

    if (process.platform == "win32") {
        app.setAppUserModelId(process.execPath);//set the appUserModelId to use notification in Windows
        if (windowsRelease() == '7' && win != null) {
            let isNotified = store.has("windows-7-notification");
            if (isNotified == false) {
                dialog.showMessageBox(win, {
                    title: i18n.__('windows-7-notification'),
                    type: "warning",
                    message: i18n.__('windows-7-notification-msg'),
                }).then(function () {
                    try {
                        store.set("windows-7-notification", 1);
                    } catch (e) {
                        console.log(e);
                    }
                });
            }
        }
    }

    if (store.get("dock-hide") && process.platform == "darwin") dockHide = true;

    if (store.get("loose-mode")) isLoose = true;

    if (win != null) {
        if (store.get("top") == true) win.setAlwaysOnTop(true);
        else win.setAlwaysOnTop(false);
    }

    function isTagNude(tag) {
        if (tag.indexOf('Control') == -1 && tag.indexOf('Shift') == -1
            && tag.indexOf('Alt') == -1 && tag.indexOf('Command') == -1 && tag.indexOf('Win') == -1)
            return true;
        else return false;
    }

    try {
        if (!store.get('hotkey1')) store.set('hotkey1', cmdOrCtrl._("long", "pascal") + ' + Alt + Shift + W');
        else if (isTagNude(store.get('hotkey1'))) store.set('hotkey1', cmdOrCtrl._("long", "pascal") + ' + Alt + Shift + ' + store.get('hotkey1'));
    } catch (e) {
        console.log(e);
    }
    try {
        if (!store.get('hotkey2')) store.set('hotkey2', cmdOrCtrl._("long", "pascal") + ' + Alt + Shift + S');
        else if (isTagNude(store.get('hotkey2'))) store.set('hotkey2', cmdOrCtrl._("long", "pascal") + ' + Alt + Shift + ' + store.get('hotkey2'));
    } catch (e) {
        console.log(e);
    }

    globalShortcut.register(store.get('hotkey1'), () => {
        if (!isTimerWin || (isWorkMode && (workTimeFocused == false) && (!isLoose)) || ((!isWorkMode) && (restTimeFocused == false) && (!isLoose))) {
            showOrHide();
        }//prevent using hotkeys to quit
    })

    if (store.get('islocked') && win != null) {//locked mode
        win.closable = false;
    }

    try {
        store.set("just-launched", true);
        store.set("fullscreen-protection", false);
    } catch (e) {
        console.log(e);
    }

    if (process.platform == "darwin") {
        if (!app.isInApplicationsFolder()) {
            notificationSolution(i18n.__('wrong-folder-notification-title'), i18n.__('wrong-folder-notification-content'), "normal");
        }
        nativeTheme.on('updated', function theThemeHasChanged() {
            if (nativeTheme.shouldUseDarkColors) {
                try {
                    store.set('isdark', true);
                } catch (e) {
                    console.log(e);
                }
                if (win != null) {
                    win.setBackgroundColor('#191919');
                    win.webContents.send('darkModeChanges');
                }
            } else {
                try {
                    store.set('isdark', false);
                } catch (e) {
                    console.log(e);
                }
                if (win != null) {
                    win.setBackgroundColor('#fefefe');
                    win.webContents.send('darkModeChanges');
                }
            }
        })
    }

    if (process.platform == "win32") tray = new Tray(path.join(__dirname, '\\res\\icons\\iconWin.ico'));
    else if (process.platform == "darwin") tray = new Tray(path.join(__dirname, '/res/icons/trayIconMacTemplate.png'));
    if (tray != null) tray.setToolTip('wnr');
    traySolution(false);
    macOSFullscreenSolution(false);
    isDarkMode();
    settingsWinContextMenuSolution();

    if (!store.has("predefined-tasks-created")) {
        try {
            store.set("predefined-tasks-created", true);
        } catch (e) {
            console.log(e);
        }
        predefinedTasks = new Array({
            name: "wnr recommended",
            workTime: 30,
            restTime: 6,
            loops: 5,
            focusWhenWorking: false,
            focusWhenResting: true
        }, {
            name: "pomodoro",
            workTime: 25,
            restTime: 5,
            loops: 4,
            focusWhenWorking: false,
            focusWhenResting: true
        }, {
            name: "class time",
            workTime: 40,
            restTime: 10,
            loops: 1,
            focusWhenWorking: true,
            focusWhenResting: false
        });
        try {
            store.set("predefined-tasks", predefinedTasks);
            store.set("default-task", -1);//-1: not set yet
        } catch (e) {
            console.log(e);
        }
    } else predefinedTasks = store.get("predefined-tasks", predefinedTasks);//init predefined tasks
    if (store.get("worktime")) {
        predefinedTasks.push({
            name: "user default",
            workTime: store.get("worktime"),
            restTime: store.get("resttime"),
            loops: store.get('looptime'),
            focusWhenWorking: store.get("fullscreen-work"),
            focusWhenResting: store.get("fullscreen")
        })
        try {
            store.delete("worktime");
            store.delete("resttime");
            store.delete("looptime");
            store.set("predefined-tasks", predefinedTasks);
            store.set("default-task", predefinedTasks.length - 1)//the last is the newest-added
        } catch (e) {
            console.log(e);
        }
    }//alternated the former default time settings

    powerMonitor.on('lock-screen', () => {
        if (powerSaveBlockerId)
            if (powerSaveBlocker.isStarted(powerSaveBlockerId))
                powerSaveBlocker.stop(powerSaveBlockerId);
        if (win != null) win.webContents.send('alter-start-stop', 'stop');
    })

    powerMonitor.on('unlock-screen', () => {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        if (win != null) win.webContents.send('alter-start-stop', 'start')
    })

    if (process.platform == "win32") {
        var regKey = new Registry({
            hive: Registry.HKCU,
            key: '\\Control Panel\\Desktop\\'
        })
        regKey.values(function (err, items) {
            if (err)
                return 'unset';
            else {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].name == 'UserPreferencesMask') {
                        if (parseInt(items[i].value, 16).toString(2).charAt(21) == 1 && systemPreferences.isAeroGlassEnabled()) {
                            isShadowless = false;
                            try {
                                store.set("is-shadowless", false);
                            }
                            catch (e) {
                                console.log(e);
                            }
                        } else {
                            isShadowless = true;
                            try {
                                store.set("is-shadowless", true);
                            }
                            catch (e) {
                                console.log(e);
                            }
                        }
                    }
                }
            }
        })
    }//backport when shadow disabled

    leanId = process.env.LEAN_ID, leanKey = process.env.LEAN_KEY;
    leanCloudSolution();
})

function showOrHide() {
    if (settingsWin != null)
        if (settingsWin.isVisible()) {
            settingsWin.minimize();
            settingsWin.hide();
        } else {
            settingsWin.restore();
            settingsWin.show();
        }
    if (aboutWin != null)
        if (aboutWin.isVisible()) {
            aboutWin.minimize();
            aboutWin.hide();
        } else {
            aboutWin.restore();
            aboutWin.show();
        }
    if (tourWin != null)
        if (tourWin.isVisible()) {
            tourWin.minimize();
            tourWin.hide();
        } else {
            tourWin.restore();
            tourWin.show();
        }
    if (win != null)
        if (win.isVisible()) {
            win.minimize();
            win.hide();
        } else {
            win.restore();
            win.show()
        }
}

function notificationSolution(title, body, func) {
    if (Notification.isSupported()) {
        let notifier = new Notification({
            title: title,
            body: body,
            silent: false,
            icon: path.join(__dirname, process.platform == "darwin" ? '/res/icons/iconMac.png' : '\\res\\icons\\wnrIcon.png')
        })
        notifier.show();
        notifier.removeAllListeners("click");
        if (func == "hide-or-show")
            notifier.once("click", function () {
                if (win != null) {
                    win.show();
                }
            });
        else if (func == "push-notification")
            notifier.once("click", function () {
                shell.openExternal(pushNotificationLink);
            });
    } else {
        if (win != null) {
            dialog.showMessageBox(win, {
                title: title,
                type: "warning",
                message: body,
            }).then(function (response) {
                if (func == "hide-or-show") {
                    win.show();
                } else if (func == "push-notification") {
                    shell.openExternal(pushNotificationLink);
                }
            })
        }
    }
}

function traySolution(isFullScreen) {
    if (app.isReady()) {
        if (!isFullScreen) {
            if ((!store.get("islocked")) && win != null) win.closable = true;
            if (process.platform == "win32" && win != null) win.setSkipTaskbar(false);
            contextMenu = Menu.buildFromTemplate([{
                label: 'wnr' + i18n.__('v') + require("./package.json").version,
                click: function () {
                    about()
                }
            }, {
                type: 'separator'
            }, {
                label: i18n.__('start-or-stop'),
                enabled: false,
                click: function () {
                    if (win != null) win.webContents.send('start-or-stop')
                }
            }, {
                type: 'separator'
            }, {
                enabled: !isTimerWin,
                label: i18n.__('locker'),
                click: function () {
                    locker();
                }
            }, {
                enabled: (!store.get('islocked')) && (!isTimerWin),
                label: i18n.__('settings'),
                click: function () {
                    settings();
                }
            }, {
                type: 'separator'
            }, {
                label: i18n.__('website'),
                click: function () {
                    shell.openExternal('https://getwnr.com/');
                }
            }, {
                label: i18n.__('github'),
                click: function () {
                    shell.openExternal('https://github.com/RoderickQiu/wnr/');
                }
            }, {
                type: 'separator'
            }, {
                label: i18n.__('show-or-hide'), click: () => { showOrHide() }
            }, {
                label: i18n.__('exit'),
                enabled: !store.get('islocked'),
                click: () => { windowCloseChk() }
            }
            ]);
            if (tray != null) {
                tray.removeAllListeners('click');
                tray.on('click', () => {
                    if (fullScreenProtection == false) {
                        showOrHide();
                    }
                });//tray
                tray.setContextMenu(contextMenu);
            }
        } else {
            if (win != null && (!isLoose)) win.closable = false;
            if (process.platform == "win32" && win != null && (!isLoose)) win.setSkipTaskbar(true);
            contextMenu = Menu.buildFromTemplate([{
                label: 'wnr' + i18n.__('v') + require("./package.json").version
            }, {
                type: 'separator'
            }, {
                label: i18n.__('start-or-stop'),
                click: function () {
                    if (win != null) win.webContents.send('start-or-stop')
                }
            }]);
            if (tray != null) {
                tray.removeAllListeners('click');
                tray.setContextMenu(contextMenu);
                tray.on('click', () => { ; })
            }
        }
    }
}

function macOSFullscreenSolution(isFullScreen) {
    if (app.isReady()) {
        if (process.platform === 'darwin') {
            if (!isFullScreen)
                var template = [{
                    label: 'wnr',
                    submenu: [{
                        label: i18n.__('about'),
                        enabled: !isTimerWin,
                        click: function () {
                            about();
                        }
                    }, {
                        type: 'separator'
                    }, {
                        label: i18n.__('quit'),
                        accelerator: 'CmdOrCtrl+Q',
                        enabled: !store.get('islocked'),
                        click: function () {
                            windowCloseChk();
                        }
                    }]
                }, {
                    label: i18n.__('edit'),
                    submenu: [{
                        label: i18n.__('copy'),
                        role: "copy"
                    }, {
                        label: i18n.__('paste'),
                        role: "paste"
                    }, {
                        label: i18n.__('select-all'),
                        role: "selectAll"
                    }, {
                        label: i18n.__('cut'),
                        role: "cut"
                    }]
                }, {
                    label: i18n.__('operations'),
                    submenu: [{
                        enabled: (!store.get('islocked')) && (!isTimerWin),
                        label: i18n.__('settings'),
                        click: function () {
                            settings('normal');
                        }
                    }, {
                        enabled: !isTimerWin,
                        label: i18n.__('locker'),
                        click: function () {
                            locker();
                        }
                    }, {
                        label: i18n.__('tourguide'),
                        enabled: !isTimerWin,
                        click: function () {
                            tourguide();
                        }
                    }, {
                        type: 'separator'
                    }, {
                        label: i18n.__('website'),
                        click: function () {
                            shell.openExternal('https://getwnr.com/');
                        }
                    }, {
                        label: i18n.__('github'),
                        click: function () {
                            shell.openExternal('https://github.com/RoderickQiu/wnr/');
                        }
                    }]
                }];
            else
                var template = [{
                    label: 'wnr',
                    submenu: [{
                        label: i18n.__('about'),
                        enabled: false
                    }, {
                        type: 'separator'
                    }, {
                        label: i18n.__('quit'),
                        enabled: false
                    }]
                }, {
                    label: i18n.__('operations'),
                    submenu: [{
                        label: i18n.__('settings'),
                        enabled: false
                    }, {
                        label: i18n.__('locker'),
                        enabled: false
                    }, {
                        label: i18n.__('tourguide'),
                        enabled: false
                    }, {
                        type: 'separator'
                    }, {
                        label: i18n.__('website'),
                        enabled: false
                    }, {
                        label: i18n.__('github'),
                        enabled: false
                    }]
                }];
            var osxMenu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(osxMenu)
        }
    }
}

function settingsWinContextMenuSolution() {
    if (app.isReady()) {
        var template = [{
            label: i18n.__('select-all'),
            role: 'selectAll',
        }, {
            label: i18n.__('copy'),
            role: 'copy',
        }, {
            label: i18n.__('paste'),
            role: 'paste',
        }];
        settingsWinContextMenu = Menu.buildFromTemplate(template)
    }
}
ipcMain.on("settings-win-context-menu", function (event, message) {
    if (settingsWin != null) {
        try {
            settingsWinContextMenu.popup({ window: settingsWin, x: message.x, y: message.y });
        } catch {
            settingsWinContextMenu.popup({ window: settingsWin });
        }
    }
})

function leanCloudSolution() {
    try {
        AV.init({
            appId: leanId,
            appKey: leanKey
        });

        var pushNotifications = new AV.Query('notifications');
        pushNotifications.descending('createdAt');
        pushNotifications.limit(3);

        pushNotifications.find().then(function (notifications) {
            notifications.forEach(function (notification) {
                let targetVersion = notification.get('targetVersion').replace("v", "");
                if (targetVersion == null || targetVersion == "" || targetVersion == require("./package.json").version.toString()) {
                    let content = (store.get("i18n").indexOf("zh") != -1) ? notification.get('notificationContentChinese') : notification.get('notificationContentEnglish');
                    let title = (store.get("i18n").indexOf("zh") != -1) ? notification.get('notificationTitleChinese') : notification.get('notificationTitleEnglish');
                    let link = (store.get("i18n").indexOf("zh") != -1) ? notification.get('notificationLinkChinese') : notification.get('notificationLinkEnglish');
                    let id = notification.get('objectId');
                    if (!store.get(id)) {
                        pushNotificationLink = link;
                        if (pushNotificationLink != "" && pushNotificationLink != null)
                            notificationSolution(title, content, "push-notification");
                        else notificationSolution(title, content, "normal");
                        try {
                            store.set(id, true);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }
            })
        })
    } catch (e) {
        console.log(e)
    }
}

function isDarkMode() {
    if (app.isReady()) {
        try {
            store.set('isdark', false);
            darkModeSettingsFinder();
            return store.get('isdark');
        } catch (e) {
            console.log(e)
        }
    }
}
function darkModeSettingsFinder() {
    if (process.platform == "darwin") {
        if (nativeTheme.shouldUseDarkColors) {
            store.set('isdark', true);
            if (win != null) {
                win.setBackgroundColor('#191919');
                win.webContents.send('darkModeChanges');
            }
        } else {
            store.set('isdark', false);
        }
    } else if (process.platform == 'win32') {
        var regKey = new Registry({
            hive: Registry.HKCU,
            key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'
        })
        regKey.values(function (err, items) {
            if (err)
                return 'unset';
            else {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].name == 'AppsUseLightTheme') {
                        if (items[i].value == "0x0") {
                            store.set('isdark', true);
                            if (win != null) {
                                win.setBackgroundColor('#191919');
                                win.webContents.send('darkModeChanges');
                            }
                        }
                    }
                }
            }
        })
    }
}

app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})

ipcMain.on('focus-mode-settings', function (event, message) {
    workTimeFocused = message.workTimeFocused;
    restTimeFocused = message.restTimeFocused;
    isWorkMode = true;
})

ipcMain.on('warning-giver-workend', function () {
    fullScreenProtection = false;
    try {
        store.set("fullscreen-protection", false);
    } catch (e) {
        console.log(e);
    }
    if (win != null) {
        win.maximizable = false;
        isWorkMode = false;
        win.restore();
        if (restTimeFocused != true) win.show();
        win.center();
        win.flashFrame(true);
        if (!isLoose) win.setAlwaysOnTop(true);
        win.moveTop();
        if (restTimeFocused == true) {
            if (dockHide) app.dock.show();//prevent kiosk error, show in dock
            if (!isLoose) multiScreenSolution("on");
            setFullScreenMode(true);
            macOSFullscreenSolution(true);
            traySolution(true);
            if (app.isPackaged && (!isLoose)) win.setFocusable(false);
        } else {
            multiScreenSolution("off");
            setFullScreenMode(false);
            macOSFullscreenSolution(false);
            traySolution(false);
            win.setFocusable(true);
        }
        setTimeout(function () {
            dialog.showMessageBox(win, {
                title: (store.has("personalization-notification.work-time-end") ?
                    store.get("personalization-notification.work-time-end") : i18n.__('work-time-end')),
                type: "warning",
                message: (store.has("personalization-notification.work-time-end-msg") ?
                    store.get("personalization-notification.work-time-end-msg") : i18n.__('work-time-end-msg'))
                    + (hasMultiDisplays ? i18n.__('has-multi-displays') : ""),
            }).then(function (response) {
                if (restTimeFocused && (!isLoose)) {
                    fullScreenProtection = true;
                    try {
                        store.set("fullscreen-protection", true);
                    } catch (e) {
                        console.log(e);
                    }
                } else {
                    if (store.get("top") != true) {
                        win.setAlwaysOnTop(false);//cancel unnecessary always-on-top
                        win.moveTop();
                    }
                    if (dockHide) app.dock.hide();
                }
                win.webContents.send('warning-closed');
                win.maximizable = false;
            })
        }, 1500)
    }
})

ipcMain.on('warning-giver-restend', function () {
    fullScreenProtection = false;
    try {
        store.set("fullscreen-protection", false);
    } catch (e) {
        console.log(e);
    }
    if (win != null) {
        win.maximizable = false;
        isWorkMode = true;
        win.restore();
        if (workTimeFocused != true) win.show();
        win.center();
        win.flashFrame(true);
        win.setAlwaysOnTop(true);
        win.moveTop();
        if (workTimeFocused == true) {
            multiScreenSolution("on");
            if (dockHide) app.dock.show();//prevent kiosk error, show in dock
            setFullScreenMode(true);
            macOSFullscreenSolution(true);
            traySolution(true);
            if (app.isPackaged) win.setFocusable(false);
        } else {
            multiScreenSolution("off");
            setFullScreenMode(false);
            macOSFullscreenSolution(false);
            traySolution(false);
            win.setFocusable(true);
        }
        setTimeout(function () {
            dialog.showMessageBox(win, {
                title: (store.has("personalization-notification.rest-time-end") ?
                    store.get("personalization-notification.rest-time-end") : i18n.__('rest-time-end')),
                type: "warning",
                message: (store.has("personalization-notification.rest-time-end-msg") ?
                    store.get("personalization-notification.rest-time-end-msg") : i18n.__('rest-time-end-msg'))
                    + (hasMultiDisplays ? i18n.__('has-multi-displays') : ""),
            }).then(function (response) {
                if (workTimeFocused) {
                    fullScreenProtection = true;
                    try {
                        store.set("fullscreen-protection", true);
                    } catch (e) {
                        console.log(e);
                    }
                } else {
                    if (store.get("top") != true) {
                        win.setAlwaysOnTop(false);//cancel unnecessary always-on-top
                        win.moveTop();
                    }
                    if (dockHide) app.dock.hide();
                }
                win.webContents.send('warning-closed');
                win.maximizable = false;
            })
        }, 1000)
    }
})

ipcMain.on('warning-giver-all-task-end', function () {
    fullScreenProtection = false;
    try {
        store.set("fullscreen-protection", false);
    } catch (e) {
        console.log(e);
    }
    if (win != null) {
        win.maximizable = false;
        isWorkMode = false;
        win.restore();
        win.show();
        win.center();
        win.flashFrame(true);
        win.setAlwaysOnTop(true);
        win.moveTop();
        win.setProgressBar(-1);
        if (restTimeFocused == true) {
            multiScreenSolution("off");
            if (dockHide) app.dock.hide();
            setFullScreenMode(false);
            macOSFullscreenSolution(false);
            traySolution(false);
            win.setFocusable(true);
        }
        setTimeout(function () {
            dialog.showMessageBox(win, {
                title: (store.has("personalization-notification.all-task-end") ?
                    store.get("personalization-notification.all-task-end") : i18n.__('all-task-end')),
                type: "warning",
                message: (store.has("personalization-notification.all-task-end-msg") ?
                    store.get("personalization-notification.all-task-end-msg") : i18n.__('all-task-end-msg')),
            }).then(function (response) {
                win.loadFile('index.html');//automatically back
                win.maximizable = false;
                if (store.get("top") != true) {
                    win.setAlwaysOnTop(false);//cancel unnecessary always-on-top
                    win.moveTop();
                }
            })
        }, 1000);
        alarmSet()
    }
})

ipcMain.on('update-feedback', function (event, message) {
    if (settingsWin != null) {
        if (message == "update-available")
            dialog.showMessageBox(settingsWin, {
                title: i18n.__('update'),
                type: "warning",
                message: i18n.__('update-msg'),
                checkboxLabel: i18n.__('update-chk'),
                checkboxChecked: true
            }).then(function (msg) {
                if (msg.checkboxChecked) {
                    shell.openExternal("https://github.com/RoderickQiu/wnr/releases/latest");
                }
            })
        else if (message == "no-update")
            dialog.showMessageBox(settingsWin, {
                title: i18n.__('no-update'),
                type: "info",
                message: i18n.__('no-update-msg')
            })
        else
            dialog.showMessageBox(settingsWin, {
                title: i18n.__('update-web-problem'),
                type: "info",
                message: i18n.__('update-web-problem-msg')
            })
    }
})

ipcMain.on('alert', function (event, message) {
    if (settingsWin != null) {
        dialog.showMessageBox(settingsWin, {
            title: "wnr",
            type: "info",
            message: message
        }).then(function () {
            settingsWin.moveTop();
        });
    } else {
        dialog.showMessageBox(win, {
            title: "wnr",
            type: "info",
            message: message
        })
    }
})

ipcMain.on('delete-all-data', function () {
    if (settingsWin != null) {
        dialog.showMessageBox(settingsWin, {
            title: i18n.__('delete-all-data-dialog-box-title'),
            type: "warning",
            message: i18n.__('delete-all-data-dialog-box-content'),
            checkboxLabel: i18n.__('delete-all-data-dialog-box-chk'),
            checkboxChecked: false
        }).then(function (msg) {
            if (msg.checkboxChecked || msg.response != 0) {
                store.clear();
                app.relaunch();
                app.quit()
            }
        })
    }
})

function windowCloseChk() {
    if (app.isPackaged && win != null)
        dialog.showMessageBox(win, {
            title: i18n.__('window-close-dialog-box-title'),
            type: "warning",
            message: i18n.__('window-close-dialog-box-content'),
            checkboxLabel: i18n.__('window-close-dialog-box-chk'),
            checkboxChecked: false
        }).then(function (msger) {
            if (msger.checkboxChecked) {
                multiScreenSolution("off");
                app.quit();
            }
        })
    else {
        app.quit()
    }
}
ipcMain.on('window-close-chk', windowCloseChk);

ipcMain.on('global-shortcut-set', function (event, message) {
    let hasFailed = false;
    try {
        if (globalShortcut.isRegistered(message.before))
            globalShortcut.unregister(message.before);
        if (message.type == '1') {
            globalShortcut.register(message.to, () => {
                if (!isTimerWin || (isWorkMode && (workTimeFocused == false) && (!isLoose)) || ((!isWorkMode) && (restTimeFocused == false) && (!isLoose))) {
                    showOrHide();
                }//prevent using hotkeys to quit
            })
        }
    } catch (e) {
        hasFailed = true;
        dialog.showMessageBox(settingsWin, {
            title: i18n.__('settings'),
            type: "warning",
            message: i18n.__('hotkey-failed')
        });
        console.log(e);
    } finally {
        if (!hasFailed) {
            try {
                store.set("hotkey" + message.type, message.to);
            } catch (err) {
                console.log(err);
            }
        }
    }
})

ipcMain.on('relauncher', function () {
    try {
        store.set('just-relaunched', true);
        app.relaunch();
    } catch (e) {
        console.log(e);
    }
    app.exit(0)
})

ipcMain.on('window-hide', function () {
    if (win != null) {
        win.minimize();
        win.hide()
    }
})

ipcMain.on('window-minimize', function () {
    if (win != null) win.minimize()
})

function about() {
    if (app.isReady()) {
        if (win != null) {
            aboutWin = new BrowserWindow({
                parent: win,
                width: 279,
                height: 297,
                backgroundColor: isDarkMode() ? "#191919" : "#fefefe",
                resizable: false,
                maximizable: false,
                minimizable: false,
                frame: false,
                show: false,
                center: true,
                titleBarStyle: "hidden",
                webPreferences: { nodeIntegration: true }
            });
            aboutWin.loadFile("about.html");
            win.setAlwaysOnTop(true);
            aboutWin.setAlwaysOnTop(true);
            aboutWin.focus();
            aboutWin.once('ready-to-show', () => {
                aboutWin.show();
                try {
                    let aboutWinTouchBar = new TouchBar({
                        items: [
                            new TouchBarLabel({ label: "wnr " + i18n.__('v') + require("./package.json")["version"] })
                        ]
                    });
                    aboutWinTouchBar.escapeItem = new TouchBarButton({
                        label: i18n.__('close'),
                        click: () => aboutWin.close()
                    });
                    aboutWin.setTouchBar(aboutWinTouchBar);
                } catch (e) {
                    console.log(e);
                }
            })
            aboutWin.on('closed', () => {
                aboutWin = null;
                if (store.get("top") != true) win.setAlwaysOnTop(false)
            })
        }
    }
}
ipcMain.on('about', about);

function settings(mode) {
    if (app.isReady()) {
        if (win != null) {
            settingsWin = new BrowserWindow({
                parent: win,
                width: isChinese ? 780 : 888,
                height: 480,
                backgroundColor: isDarkMode() ? "#191919" : "#fefefe",
                resizable: false,
                maximizable: false,
                minimizable: false,
                frame: false,
                show: false,
                center: true,
                webPreferences: { nodeIntegration: true },
                titleBarStyle: "hidden"
            });
            try {
                if (mode == 'locker') store.set("settings-goto", "locker");
                else if (mode == 'predefined-tasks') store.set("settings-goto", "predefined-tasks");
                else store.set("settings-goto", "normal");
            } catch (e) {
                console.log(e);
            }
            settingsWin.loadFile("settings.html");
            win.setAlwaysOnTop(true);
            settingsWin.setAlwaysOnTop(true);
            settingsWin.focus();
            settingsWin.once('ready-to-show', () => {
                settingsWin.show();
                try {
                    let settingsWinTouchBar = new TouchBar({
                        items: [
                            new TouchBarLabel({ label: i18n.__('newbie-for-settings-tip') })
                        ]
                    });
                    settingsWinTouchBar.escapeItem = new TouchBarButton({
                        label: i18n.__('close'),
                        click: () => settingsWin.close()
                    });
                    settingsWin.setTouchBar(settingsWinTouchBar);
                } catch (e) {
                    console.log(e);
                }
            })
            settingsWin.on('closed', () => {
                if (win != null) {
                    win.reload();
                    if (store.get("top") != true) win.setAlwaysOnTop(false);
                }
                settingsWin = null;
                if (store.get("loose-mode")) isLoose = true;
                else isLoose = false;
            })
            if (!store.get("settings-experience")) {
                try {
                    store.set("settings-experience", true);
                } catch (e) {
                    console.log(e);
                }
                notificationSolution(i18n.__('newbie-for-settings'), i18n.__('newbie-for-settings-tip'), "normal");
                if (process.platfrom == "darwin")
                    notificationSolution(i18n.__('newbie-for-settings'), i18n.__('permission-ask'), "normal")
            }
        }
    }
}
ipcMain.on('settings', settings);

function tourguide() {
    if (app.isReady()) {
        if (win != null) {
            tourWin = new BrowserWindow({
                parent: win,
                width: 672,
                height: 600,
                backgroundColor: isDarkMode() ? "#191919" : "#fefefe",
                resizable: false,
                maximizable: false,
                minimizable: false,
                frame: false,
                show: false,
                center: true,
                titleBarStyle: "hidden",
                webPreferences: { nodeIntegration: true }
            });
            tourWin.loadFile("tourguide.html");
            win.setAlwaysOnTop(true);
            tourWin.setAlwaysOnTop(true);
            tourWin.focus();
            tourWin.once('ready-to-show', () => {
                tourWin.show();
                let tourWinTouchBar = new TouchBar({
                    items: [
                        new TouchBarLabel({ label: i18n.__('welcome-part-1') })
                    ]
                });
                tourWinTouchBar.escapeItem = new TouchBarButton({
                    label: i18n.__('close'),
                    click: () => tourWin.close()
                });
                tourWin.setTouchBar(tourWinTouchBar);
            })
            tourWin.on('closed', () => {
                tourWin = null;
                if (store.get("top") != true) win.setAlwaysOnTop(false);
                win.moveTop();
                win.focus();
            })
            notificationSolution(i18n.__('welcome-part-1'), i18n.__('welcome-part-2'), "normal");
        }
    }
}
ipcMain.on('tourguide', tourguide);


function predefiner() {
    settings('predefined-tasks');
}
ipcMain.on('predefined-tasks', predefiner);

function locker() {
    settings('locker');
}
ipcMain.on('locker', locker);
ipcMain.on('locker-passcode', function (event, message) {
    let lockerMessage = null;
    if (message == "wrong-passcode") lockerMessage = i18n.__('locker-settings-input-tip-wrong-password');
    if (message == "lock-mode-on") lockerMessage = i18n.__('locker-settings-status') + i18n.__('on') + i18n.__('period-symbol');
    if (message == "lock-mode-off") lockerMessage = i18n.__('locker-settings-status') + i18n.__('off') + i18n.__('period-symbol');
    if (message == "not-same-password") lockerMessage = i18n.__('locker-settings-not-same-password');
    if (message == "empty") lockerMessage = i18n.__('locker-settings-empty-password');
    if (settingsWin != null)
        dialog.showMessageBox(settingsWin, {
            title: i18n.__('locker-settings'),
            type: "warning",
            message: lockerMessage
        }).then(function (response) {
            if (message == "lock-mode-on" || message == "lock-mode-off") {
                if (settingsWin != null) settingsWin.close();
                settingsWin = null;
                app.relaunch();
                app.exit()
            }
        })
})

ipcMain.on('only-one-min-left', function () {
    if (!store.get('fullscreen-protection'))
        notificationSolution(i18n.__('only-one-min-left'), i18n.__('only-one-min-left-msg'), "normal")
})

ipcMain.on("progress-bar-set", function (event, message) {
    progress = 1 - message;
    if (win != null) win.setProgressBar(progress);
    if (tray != null) tray.setToolTip(message * 100 + timeLeftTip)
    if (process.platform == "darwin")
        if (timeLeftOnBar != null) timeLeftOnBar.label = message * 100 + timeLeftTip;
})

ipcMain.on("should-nap", function () {
    notificationSolution(i18n.__('should-nap-now'), i18n.__('should-nap-now-msg'), "normal")
})

ipcMain.on("logger", function (event, message) {
    console.log(message)
})

ipcMain.on("timer-win", function (event, message) {
    if (win != null) win.maximizable = false;

    if (message) {
        isDarkMode();
        if (aboutWin != null) aboutWin.close();
        if (tourWin != null) tourWin.close();
        if (settingsWin != null) settingsWin.close();
        globalShortcut.register(store.get('hotkey2'), () => {
            if (win != null) win.webContents.send('start-or-stop');
        })
        if (resetAlarm) {
            clearTimeout(resetAlarm);
        }
        powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');//prevent wnr to be suspended when timing
        isTimerWin = true;
        traySolution();
        macOSFullscreenSolution();
        touchBarSolution("timer");
        if (tray != null) {
            contextMenu.items[2].enabled = true;
        }
    } else {
        if (win != null) {
            win.focus();
            win.setProgressBar(-1);
        }
        if (dockHide) app.dock.hide();
        if (globalShortcut.isRegistered(store.get('hotkey2')))
            globalShortcut.unregister(store.get('hotkey2'));
        alarmSet();
        if (powerSaveBlockerId)
            if (powerSaveBlocker.isStarted(powerSaveBlockerId))
                powerSaveBlocker.stop(powerSaveBlockerId);
        isTimerWin = false;
        traySolution();
        macOSFullscreenSolution();
        touchBarSolution("index");
        if (tray != null) {
            tray.setToolTip('wnr');
            contextMenu.items[2].enabled = false;
        }
        multiScreenSolution("off")
    }
})