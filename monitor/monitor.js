//**********************
//Init ws module
//**********************
var serverip = location.hostname;
var serverurl = 'ws://'+serverip+":9091";
//var conn = new WebSocket('ws://118.25.176.33:9091');
//var conn = new WebSocket('ws://localhost:9091');
var conn = new WebSocket(serverurl);
//console.log(serverurl);


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

var localVideo = document.querySelector('#localVideo');
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
        case "normalinfo":
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

//alias for sending JSON encoded messages
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

function handleLogin(success) {
    if (success === false) {
        alert("Ooops...try a different username");
    } else {
        loginPage.style.display = "none";
        callPage.style.display = "block";

        //getting local video stream
        navigator.mediaDevices.getUserMedia({
            video: true, audio: true
        }).then(streamHandler).catch(errorHandler);

    }
};

//when somebody sends us an offer
async function handleOffer(offer, name) {
    //如果没创建RTCPeerConnection,需要重新创建连接对象，否则不需要
    if(RTCPeerConnectionCreated == false) {
        initPeer();
    }
    connectedUsername = name;
/*以下的代码，rollback只有火狐浏览器才支持
    // We need to set the remote description to the received SDP offer
    // so that our local WebRTC layer knows how to talk to the caller.
    // if the singnaling is not stable state, use type rollback to roll
    // the incomplete signaling peer connection back to "stable" state.
    // Because we call setLocalDescription before, maybe the PeerConnection
    // are still in "have-local-offer" state,so the process need to
    // rollback to "stable" state before you can reuse the connection.
    if (myPeerConnection.signalingState != "stable") {
        await Promise.all([
            myPeerConnection.setLocalDescription({type: "rollback"}),
            myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        ]);
        return;
    }else{
        await myPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    }
*/
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

//when we got an answer from a remote user
async function handleAnswer(answer) {
    await myPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
    myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

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
    myPeerConnection.onnotificationneeded = null;
    myPeerConnection.close();
    myPeerConnection = null;

    RTCPeerConnectionCreated = false;

    hangUpBtn.disabled = true;
    callBtn.disabled = false;

};

//initiating a call，before call,peerConnection must be created and setted
callBtn.addEventListener("click", function () {

    //caller must init RTCPeerConnection
    initPeer();
    //sendOffer，createOffer现在放到处理onnegotiationneeded的事件中去了
/*
    var callToUsername = callToUsernameInput.value;
    if (callToUsername.length > 0) {
        connectedUsername = callToUsername;
        // create an offer
        myPeerConnection.createOffer().then(function(offer){
            myPeerConnection.setLocalDescription(offer);
            sendToServer({
                type: "offer",
                offer: offer
            });
        }).catch(function (error) {
            alert("Error when creating an offer");
        });
    }
*/


});
//hang up
hangUpBtn.addEventListener("click", function () {
    sendToServer({
        type: "leave"
    });
    handleLeave();

});



function streamHandler(myStream) {
    stream = myStream;
    //displaying local video stream on the page
    localVideo.srcObject = stream;
    window.localStream  = stream;

}

function errorHandler(error) {
    console.log(error);
}

//using Google public stun server
const configuration = {
    //"iceServers": [{ "url": "stun:stun2.1.google.com:19302" }]
    "iceServers": [{ "urls": "stun:stun2.1.google.com:19302" }]
};
//**********************
//Init a peer connection
//**********************
function initPeer()
{

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
        myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

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
    hangUpBtn.disabled = false;
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

//Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent() {
    console.log("*** Negotiation needed event");

    try {
        // If the connection hasn't yet achieved the "stable" state,
        // return to the caller. Another negotiationneeded event
        // will be fired when the state stabilizes.
        if (myPeerConnection.signalingState != "stable") {
            console.log("-- The connection isn't stable yet; postponing...")
            //await myPeerConnection.setLocalDescription({type: "rollback"});//目前只有火狐支持
            return;
        }

        console.log("---> Creating offer");

        var callToUsername = callToUsernameInput.value;
        if (callToUsername === myUsername) {
            alert("can't let you talk to yourself. That would be weird.");
            return;
        }
        if (callToUsername.length > 0) {
            connectedUsername = callToUsername;
            // create an offer

            //method1
            const offer = await myPeerConnection.createOffer();
            await myPeerConnection.setLocalDescription(offer);
            sendToServer({
                type: "offer",
                offer: offer
            });

            // 用promise方法，每次a呼叫b，主动断开，再由b呼叫a，
            // 就会导致myPeerConnection处于have-local-offer的非stable状态。
            /*
            //method2
            myPeerConnection.createOffer().then(function(offer){
                //这种写法每次到这里返回的总是为have-local-offer状态很奇怪
                console.log('[Negotiation]cur signalstate:'+myPeerConnection.signalingState);
                myPeerConnection.setLocalDescription(offer);
                sendToServer({
                    type: "offer",
                    offer: offer
                });
            }).catch(function (error) {
                console.log(`Error ${error.name}: ${error.message}`);
                alert("Error when creating an offer");
            });
            */

            /*
            //method3
            //这里的promise多用了一个then,但是有问题
            //offer和myPeerConnection.localDescription等价
            myPeerConnection.createOffer().then(function(offer) {
                //和上面一样，这种写法每次到这里返回的总是为have-local-offer状态很奇怪
                return myPeerConnection.setLocalDescription(offer);
                //myPeerConnection.setLocalDescription(offer);
            }).then(function(){
                sendToServer({
                    type: "offer",
                    offer: myPeerConnection.localDescription
                });
            }).catch(function (error) {
                console.log(`Error ${error.name}: ${error.message}`);
                alert("Error when creating an offer");
            });
            */

        }

    } catch(err) {
        console.log("*** The following error occurred while handling the negotiationneeded event:");
        //reportError(err);
        console.log(`Error ${err.name}: ${err.message}`);
    };
}
