/***
 * 本文件是视频请求方逻辑，但是不是真正的请求。
 * 它通过向另一方发送命令，让连接的另一方返回来请求我们自己
 */
//**********************
//Init ws module
//**********************
var serverip = location.hostname;
var serverurl = 'ws://'+serverip+":9091";
var conn = new WebSocket(serverurl);

//本地登录用户our username
var myUsername = null;
//远程连接用户usermyUsername that connected to us
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
var usernameInput = document.querySelector('#usernameInput');
var loginBtn = document.querySelector('#loginBtn');

var callPage = document.querySelector('#callPage');
var callToUsernameInput = document.querySelector('#callToUsernameInput');
var callBtn = document.querySelector('#callBtn');

var hangUpBtn = document.querySelector('#hangUpBtn');

//var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

loginPage.style.display = "block";
callPage.style.display = "none";

//******
//ws eventHandler
//******
conn.onopen = function () {
    console.log("Connected to the signaling server");
};

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


//******
//UI events definitatoin
//******
// Login when the user clicks the button
loginBtn.addEventListener("click", function (event) {
    myUsername = usernameInput.value;
    if (myUsername.length > 0) {
        sendToServer({
            type: "login",
            name: myUsername
        });
    }
});

/**
 * 当登录进服务器时，服务器会回复给我们，需要根据成功还是失败进行处理
 * @param success
 */
function handleLogin(success) {
    if (success === false) {
        alert("Ooops...try a different username");
    } else {
        loginPage.style.display = "none";
        callPage.style.display = "block";
/*
        //getting local video stream
        navigator.mediaDevices.getUserMedia({
            video: true, audio: true
        }).then(streamHandler).catch(errorHandler);
*/
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
    remoteVideo.src = null;

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
    //按钮相应的要变化
    hangUpBtn.disabled = true;
    callBtn.disabled = false;

};

//initiating a call，before call,peerConnection must be created and setted
callBtn.addEventListener("click", function () {

    //caller must init RTCPeerConnection
    initPeer();
    //发送命令逻辑
    var callToUsername = callToUsernameInput.value;
    if (callToUsername === myUsername) {
        alert("can't let you talk to yourself. That would be weird.");
        return;
    }
    if (callToUsername.length > 0) {
        connectedUsername = callToUsername;
        //通过浏览器的观察方不再发起请求，而是发起让对方发起createOffer的请求的命令。
        //原因是因为如果发起请求方没有摄像头，则请求会失败
        //但是如果应答方没有摄像头是没有关系的！

        sendToServer({
            type: "cmd"
        });

/*      create an offer 弃用
        let offer =  myPeerConnection.createOffer();
        myPeerConnection.setLocalDescription(offer);
        sendToServer({
            type: "offer",
            offer: offer
        });
*/

    }

});


hangUpBtn.addEventListener("click", function () {
    //先通知挂断（如果是放在handleLeave里面是实现不了的，因为已经先挂断了）
    //另外放到stateChange事件去触发也不是个好办法，同上
    //按了按钮才会给对方发送挂断信息，直接关闭浏览器，对方是不会知道你已经挂断的
    sendToServer({
        type: "sendinfo",
        info: "对方已挂断",
        close: false
    });

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
    //localVideo.srcObject = stream;
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

    try {
        myPeerConnection = new RTCPeerConnection(configuration);
        //add stream to local first
        /*
        if ("addTrack" in myPeerConnection) {
            // use addTrack
            stream.getTracks().forEach(track => {
                myPeerConnection.addTrack(track, stream);
            });
        } else {
            myPeerConnection.addStream(stream);
        }
        */
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
            /*
            myPeerConnection.onremovestream = function (e) {
                console.log('Remote stream removed. Event: ', e);
            }*/

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
    remoteVideo.srcObject = e.streams[0];
    //once add remote video success, we set call button disabled
    hangUpBtn.disabled = false; //放这里可能并不太好
    callBtn.disabled = true;
}
//since addstream is desperated
async function handleRemoteStreamAdded(e) {
    //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
    remoteVideo.srcObject = e.stream;
    //once add remote video success, we set call button disabled
    hangUpBtn.disabled = false;
    callBtn.disabled = true;
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


