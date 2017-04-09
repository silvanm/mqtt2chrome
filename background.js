/*
 by @bordignon
 October 2013-2015
 You can do what you want with the code as long as you provide attribution
 back to me and don't hold me liable.

 This Chrome extension will connect to a MQTT broker using websockets and
 then subscribe to a topic. When a message is received it will be displayed
 using Chrome's built-in notifications function.

 This extension expects to receive a specific JSON payload formatted as
 follows:
 { "sub": "", "txt": "", "img": "", "url":"" }
 Where:
 'sub' represents the notification heading used in the notification.
 'txt' represents the text used in the notification.
 'img' optional; lets you have a thumbnail for the notification. For example; alert.png, warning.png, etc.
 'url' optional; http web link

 This extension requires "notifications" permission.

 Changelog:
 v4 -- Jan 2014 -- upgraded to newer chrome notifications, removed webkit
 support.
 v4.2 -- fixed url's when you click on a message also added a url parameter to the json messages

 todo;
 - thumbnails directory, once you make the extension and publish it you can't add any new icons.
 */

// This variable is used when generating unique notification identifiers.
var notificationId = 0;
var urls = {};
/*
 Conditionally initialize the options to reasonable defaults and
 open the options in a new tab for the user to configure appropriately.
 */
if (!localStorage.isInitialized) {
    // Initialize extension options to sone default values.
    localStorage.broker = "hoenggerberg.muehlemann-popp.ch";       // broker websocket address
    localStorage.port = 8083;                           // broker websocket port
    localStorage.username = "chrome";                       // broker username, leave blank for none
    localStorage.password = "";                       // broker password, leave blank for none
    localStorage.subtopic = "presence_status";  // topic to subscribe to
    localStorage.reconnectTimeout = 10;               // Clear notifications after this many seconds
    localStorage.clearNotifications = true;           // Enable automatic clearing of notifications

    localStorage.isInitialized = true;                // Only initialise once
    //chrome.tabs.create({url: chrome.extension.getURL('options.html')});
}


//connect to the broker function
function connect() {
    console.log("Connecting to `" + localStorage.broker + "` on port `" + localStorage.port + "`");
    var clientId = "myclientid_" + parseInt(Math.random() * 100, 10);

    client = new Messaging.Client(localStorage.broker,
        parseInt(localStorage.port),
        clientId);
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    var connectOptions = new Object();
    connectOptions.useSSL = false;
    connectOptions.cleanSession = true;
    connectOptions.onSuccess = onConnect;
    if (localStorage.username != "") {
        connectOptions.userName = localStorage.username;
    }
    if (localStorage.password != "") {
        connectOptions.password = localStorage.password;
    }
    client.connect(connectOptions);
}

// Clear the popupNotification
function clearNotification(notificationId) {
    chrome.notifications.clear(notificationId, clearedCallback);
}

//not sure what to do with this yet!
function createdCallback(n_id) {
    console.log("Succesfully created " + n_id + " notification");
}

function clearedCallback(wasCleared) {
    console.log("Succesfully cleared notification: " + wasCleared);
}

// create the popupNotification in Chrome
function popupNotification(poptitle, popmessage, popicon, popurl) {
    return true;
    options = {
        type: "basic",
        title: poptitle,
        message: popmessage,
        iconUrl: popicon,
        priority: 2
    };
    var n_id = "id" + notificationId++;

    chrome.notifications.create(n_id, options, createdCallback);

    //add the url to the array.
    //if(typeof popurl === 'undefined'){ popurl = 'http://google.com' };
    urls[n_id] = popurl;

    if (JSON.parse(localStorage.clearNotifications)) {
        // discard notification after timeout period
        window.setTimeout(function () {
                clearNotification(n_id)
            },
            parseInt(localStorage.notificationTimeout) * 1000);
    }
}

/*
 Once connected to the broker, subscribe to the subtopic.
 */
function onConnect() {
    console.log("Connected to broker, subscribing for subtopic: " + localStorage.subtopic);
    client.subscribe(localStorage.subtopic);
    chrome.browserAction.setIcon({path: "icon_blue128.png"});
    popupNotification("MQTT Broker connected", "", "icon.png");

    /*
     //uncomment the below if you want to publish to a topic on connect
     message = new Messaging.Message("Hello");
     message.destinationName = "/World";
     client.send(message);
     */
};

/*
 If the connection has been lost, display a notification, change icon
 and wait `reconnectTimeout` secs before trying to connect again.
 */
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("Connection to broker lost:" + responseObject.errorMessage);
        chrome.browserAction.setIcon({path: "icon_grey128.png"});
        popupNotification("MQTT Broker disconneced", "Reason: " + responseObject.errorMessage, "icon_noconnection.png");
        if (localStorage.reconnectTimeout !== 0) {
            window.setTimeout(connect, parseInt(localStorage.reconnectTimeout, 10) * 1000); //wait X seconds before trying to connect again.
        }
    }
};

/*
 Upon receipt of a message from the broker, display the message
 as a Chrome notification.
 */
function onMessageArrived(message) {
    //console.log("New Message has Arrived: "+message.destinationName + " " + message.payloadString);
        var msg = message.payloadString;
        var thumbnail;
        var url;
        //console.log(msg.sub);
        //console.log(msg.txt);
        //console.log(msg.img);
        //console.log(msg.url);


        if (msg == 'green') {
            chrome.browserAction.setIcon({path: "icon_green128.png"});
        } else if (msg == 'red') {
            chrome.browserAction.setIcon({path: "icon_red128.png"});
        } else {
            chrome.browserAction.setIcon({path: "icon_blue128.png"});
        }
        popupNotification(message.destinationName, message.payloadString, "icon.png");
};

//used for when you click the MQTT extension icon in the menu bar
//it will disconnect the broker and then reconnect
chrome.browserAction.onClicked.addListener(function () {
    console.log('MQTT extension icon clicked, disconnect and reconnect to broker in progress');
    try {
        client.disconnect();
        chrome.browserAction.setIcon({path: "icon_grey128.png"});

    }
    catch (e) {
        console.log(e);
    }
    ;
    window.setTimeout(connect, 2000);
});

//open the url in a new tab
function notificationClicked(id) {
    console.log("The notification '" + id + "' was clicked");
    if (!(typeof urls[id] === 'undefined')) {
        chrome.tabs.create({url: urls[id]});
    }
    ;
}

function notifyClose(id, byUser) {
    // Clean up the matching
    console.log("The notification '" + id + "' was cleaned up");
    delete urls[id];
}

connect();

// Check connection status every 10 seconds
function checkConnectionStatus() {
    if (!client.isConnected()) {
      connect();
    }
}

window.setInterval(function () { checkConnectionStatus()}, 10000);