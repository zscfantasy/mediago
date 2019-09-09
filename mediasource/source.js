'use strict';
//本js作为webrtc的一部分。负责采集视频流，并在收到对方的cmd命令后，把视频发送给对方
//设计思路是本地采集和webrtc RTCPeerConnection分开处理。本地不采集视频，就不初始化RTCPeerConnection

/*
//var conn = new WebSocket('ws://118.25.176.33:9091');
//var conn = new WebSocket('ws://localhost:9091');
var servernameInput = document.querySelector('#servernameInput');
var servername = servernameInput.value;
servername = servername.replace(/(^\s*)|(\s*$)/g, ""); 	//替换输入内容当中所有的空字符，包括全角空格，半角都替换""
var serverurl = 'ws://'+servername+":9091";
var conn = new WebSocket(serverurl);
*/
var conn;

//本地登录用户our username
var myUsername = null;
//远程连接用户usermyUsername that connected to usOffer
var connectedUsername = null;
//RTCPeerConnection
var myPeerConnection;
// MediaStream from webcam
var stream;
//当前客户端的RTCPeerConnection是否创建了
var RTCPeerConnectionCreated = false;

//******
//UI selectors block
//******
var loginPage = document.querySelector('#loginPage');
var loginBtn = document.querySelector('#loginBtn');
var wsBtn = document.querySelector('#wsBtn');
//var servernameInput = document.querySelector('#servernameInput');  //放到上面去了
var usernameInput = document.querySelector('#usernameInput');

var callPage = document.querySelector('#callPage');
var startBtn = document.querySelector('#startBtn');
var closeBtn = document.querySelector('#closeBtn');
var hangUpBtn = document.querySelector('#hangUpBtn');

var localVideo = document.querySelector('#localVideo');


loginPage.style.display = "block";
callPage.style.display = "none";
loginBtn.disabled = true;

wsBtn.addEventListener("click", function () {

    var servernameInput = document.querySelector('#servernameInput');
    var servername = servernameInput.value;
    servername = servername.replace(/(^\s*)|(\s*$)/g, ""); 	//替换输入内容当中所有的空字符，包括全角空格，半角都替换""
    var serverurl = 'ws://'+servername+":9091";
    conn = new WebSocket(serverurl);

    //when we got a message from a signaling server
    conn.onmessage = function (msg) {
        console.log("Got message", msg.data);
        var data = JSON.parse(msg.data);
        switch(data.type) {
            case "login":
                handleLogin(data.success);
                break;
            //when somebody wants to call us
            case "offer":
                handleOffer(data.offer, data.name);
                break;
            case "answer":
                handleAnswer(data.answer);
                break;
            //when a remote peer sends an ice candidate to us
            case "candidate":
                handleCandidate(data.candidate);
                break;
            case "leave":
                handleLeave();
                break;
            case "cmd":
                handleCmd(data.sender);
                break;
            case "sendinfo":
                alert(data.info);
                if(data.close == true){
                    //关闭页面在各大浏览器下不兼容，选择折衷的about:blank法
                    window.location.href="about:blank";
                }
                break;
            default:
                break;
        }
    };

    conn.onerror = function (err) {
        console.log("Got error", err);
    };

    //******
    //ws eventHandler
    //******
    conn.onopen = function () {
        console.log("Connected to the signaling server");
    };

    //set btn valid
    loginBtn.disabled = false;
    wsBtn.disabled = true;

});
//******
//execute main
//******
//打开网页就已经通过ws和服务器连接了.并在服务器创建用户，这个过程只执行一次
//login button handler
loginBtn.addEventListener("click", function () {

    //处理username
    myUsername = usernameInput.value;
    myUsername = myUsername.replace(/(^\s*)|(\s*$)/g, ""); 	//替换输入内容当中所有的空字符
    if (myUsername.length > 0) {
        sendToServer({
            type: "login",
            name: myUsername
        });
    }

});




/**
 * alias for sending JSON encoded messages
 * 发送给服务器，然后服务器再转发给另外一个客户端
 * @param message
 */
function sendToServer(message) {
    //attach the other peer username to our messages
    if (connectedUsername) {
        message.name = connectedUsername;
    }
    conn.send(JSON.stringify(message));
};

/**
 * 当登录进服务器时，服务器会回复给我们，需要根据成功还是失败进行处理
 * @param success
 */
function handleLogin(success) {
    if (success === false) {
        alert("Ooops...maybe the same username in server,try a different username");
    } else {
        //登录成功，显示该显示的界面
        loginPage.style.display = "none";
        callPage.style.display = "block";
    }
};


/**
 * when somebody sends us an offer
 * @param offer 表示offer
 * @param name  表示发送offer给我的人（另一方）
 * @returns {Promise<void>}
 */
async function handleOffer(offer, name) {
    //如果没创建RTCPeerConnection,需要重新创建连接对象，否则不需要
    if(RTCPeerConnectionCreated == false) {
        initPeer();
    }
    connectedUsername = name;

    await myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    //create an answer to an offer
    myPeerConnection.createAnswer().then(function (answer) {
        myPeerConnection.setLocalDescription(answer);
        sendToServer({
            type: "answer",
            answer: answer
        });
    }).catch(function (error) {
            alert("Error when creating an answer");
    });
};

/**
 * when we got an answer from a remote user
 * @param answer 对方发过来的answer
 * @returns {Promise<void>}
 */
async function handleAnswer(answer) {
    await myPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

/**
 * when we got an ice candidate from a remote user
 * @param candidate 对方法发过来的candidate
 */
function handleCandidate(candidate) {
    myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

/**
 * 断开连接的处理逻辑
 */
function handleLeave() {

    //attention sequence
    connectedUsername = null;
    //remoteVideo.src = null;

    // Disconnect all our event listeners; we don't want stray events
    // to interfere with the hangup while it's ongoing.
    myPeerConnection.onicecandidate = null;
    myPeerConnection.onaddstream = null;
    myPeerConnection.ontrack = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    //myPeerConnection.onnotificationneeded = null;
    myPeerConnection.close();
    myPeerConnection = null;

    RTCPeerConnectionCreated = false;

    hangUpBtn.disabled  = true;

};


//打开关闭摄像头的按钮只和音视频采集有关，不涉及ws传输逻辑
//改成打开摄像头
startBtn.addEventListener("click", function () {
    //getting local video stream
    navigator.mediaDevices.getUserMedia({
        video: true, audio: true
    }).then(streamHandler).catch(errorHandler);

    startBtn.disabled = true;
    closeBtn.disabled = false;
    hangUpBtn.disabled  = false;

});
//改成关闭摄像头
closeBtn.addEventListener("click", function () {

    stream.getTracks().forEach(track => track.stop());
    startBtn.disabled = false;
    closeBtn.disabled = true;
    hangUpBtn.disabled  = true;

});

//hang up
hangUpBtn.addEventListener("click", function () {
    //先通知挂断
    sendToServer({
        type: "sendinfo",
        info: "对方已挂断",
        close: false
    });
    //告诉对方我已经离开
    sendToServer({
        type: "leave"
    });
    handleLeave();

});

/**
 * getUserMedia的then
 * @param myStream
 */
function streamHandler(myStream) {
    stream = myStream;
    //displaying local video stream on the page
    localVideo.srcObject = stream;
    window.localStream  = stream;

}
/**
 * getUserMedia的catch
 * @param error
 */
function errorHandler(error) {
    console.log(error);
}

//using Google public stun server
const configuration = {
    //"iceServers": [{ "url": "stun:stun2.1.google.com:19302" }]
    //"iceServers": [{ "urls": "stun:stun2.1.google.com:19302" }]
    "iceServers": [{
        'urls': [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun.l.google.com:19302?transport=udp',
        ]
    }]
};
//**********************
//Init a peer connection
//**********************
function initPeer()
{
    //因为各浏览器差异，RTCPeerConnection 一样需要加上前缀。
    let PeerConnection = window.RTCPeerConnection ||
        window.mozRTCPeerConnection ||
        window.webkitRTCPeerConnection;

    try {
        myPeerConnection = new RTCPeerConnection(configuration);
        //add stream to local first
        if ("addTrack" in myPeerConnection) {
            /* use addTrack */
            stream.getTracks().forEach(track => {
                myPeerConnection.addTrack(track, stream);
            });
        } else {
            myPeerConnection.addStream(stream);
        }
        //**********************
        //Register event process needed
        //**********************
        // setup stream listening
        if ("ontrack" in myPeerConnection) {
            //when a remote user adds stream to the peer connection, we display it
            myPeerConnection.ontrack = handleRemoteTrackAdded;

        } else {
            //when a remote user adds stream to the peer connection, we display it
            myPeerConnection.onaddstream = handleRemoteStreamAdded;

        }
        // Setup other events
        myPeerConnection.onicecandidate = handleIceCandidate;
        myPeerConnection.oniceconnectionstatechange = handleIceConnectionStateChangeEvent;
        myPeerConnection.onicegatheringstatechange = handleIceGatheringStateChangeEvent;
        myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
        //myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

        RTCPeerConnectionCreated = true;
    }catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        RTCPeerConnectionCreated = false;
        return;
    }

}

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.
async function handleIceCandidate(event) {
    if (event.candidate) {
        sendToServer({
            type: "candidate",
            candidate: event.candidate
        });
    }
}

// 能触发这个表明已经连接远程摄像头成功并且媒体流已经在暗流涌动了，接下来在他里面使用媒体流即可！
// Called by the WebRTC layer when events occur on the media tracks
// on our WebRTC call. This includes when streams are added to and
// removed from the call.
//
// track events include the following fields:
//
// RTCRtpReceiver       receiver
// MediaStreamTrack     track
// MediaStream[]        streams
// RTCRtpTransceiver    transceiver
//
// In our case, we're just taking the first stream found and attaching
// it to the <video> element for incoming media.
async function handleRemoteTrackAdded(e) {
    //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
    //remoteVideo.srcObject = e.streams[0];
    //once add remote video success, we set call button disabled
    hangUpBtn.disabled = false;
}
//since addstream is desperated
async function handleRemoteStreamAdded(e) {
    //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
    //remoteVideo.srcObject = e.stream;
    //once add remote video success, we set call button disabled
    hangUpBtn.disabled = false;
}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.

async function handleIceConnectionStateChangeEvent(event) {
    console.log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);

    switch(myPeerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            handleLeave();
            break;
        //zsc added 不知行不行
        case "connected":
            hangUpBtn.disabled = false;
            break;
    }
}

// Handle the |icegatheringstatechange| event. This lets us know what the
// ICE engine is currently working on: "new" means no networking has happened
// yet, "gathering" means the ICE engine is currently gathering candidates,
// and "complete" means gathering is complete. Note that the engine can
// alternate between "gathering" and "complete" repeatedly as needs and
// circumstances change.
//
// We don't need to do anything when this happens, but we log it to the
// console so you can see what's going on when playing with the sample.

async function handleIceGatheringStateChangeEvent(event) {
    console.log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
}

// Set up a |signalingstatechange| event handler. This will detect when
// the signaling connection is closed.
//
// NOTE: This will actually move to the new RTCPeerConnectionState enum
// returned in the property RTCPeerConnection.connectionState when
// browsers catch up with the latest version of the specification!

async function handleSignalingStateChangeEvent(event) {
    if(myPeerConnection == null){
        return;
    }
    console.log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
    switch(myPeerConnection.signalingState) {
        case "closed":
            handleLeave();
            break;
    }
}

//收到另一方发来的命令后，就可以开始着手createOffer了。
function handleCmd(sender){


    //开始createOffer，并setLocalDescription
    if (sender.length > 0) {

        //connectedUsername是个全局变量，需要设置一下，否则sendToServer的时候不知道给谁发！
        connectedUsername = sender;
        //如果当前页面没有打开媒体流，则告知对方
        if( stream == null || !stream.active ){
            sendToServer({
                type: "sendinfo",
                info: "It seems that the other side have not open the camera",
                close: false
            });
            return;
        }

        //初始化一切为了webrtc的必要准备
        initPeer();
        // create an offer
        myPeerConnection.createOffer().then(function (offer) {
            myPeerConnection.setLocalDescription(offer);
            sendToServer({
                type: "offer",
                offer: offer
            });
        }).catch(function (error) {
            alert("Error when creating an offer");
        });
    }
}
