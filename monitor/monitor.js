//本地登录用户our username
var name;
//远程连接用户username that connected to us
var connectedUser;

//当前客户端的RTCPeerConnection是否创建了
var RTCPeerConnectionCreated = false;

//var conn = new WebSocket('ws://118.25.176.33:9091');
var conn = new WebSocket('ws://localhost:9091');

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
        default:
            break;
    }
};

conn.onerror = function (err) {
    console.log("Got error", err);
};

//alias for sending JSON encoded messages
function sendJson(message) {
    //attach the other peer username to our messages
    if (connectedUser) {
        message.name = connectedUser;
    }
    conn.send(JSON.stringify(message));
};

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

var yourConn;
var stream;

callPage.style.display = "none";

// Login when the user clicks the button
loginBtn.addEventListener("click", function (event) {
    name = usernameInput.value;
    if (name.length > 0) {
        sendJson({
            type: "login",
            name: name
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

//initiating a call，before call,peerConnection must be created and setted
callBtn.addEventListener("click", function () {

    initPeer();
    //sendOffer
    var callToUsername = callToUsernameInput.value;
    if (callToUsername.length > 0) {
        connectedUser = callToUsername;
        // create an offer
        yourConn.createOffer(function (offer) {
            sendJson({
                type: "offer",
                offer: offer
            });
            yourConn.setLocalDescription(offer);
        }, function (error) {
            alert("Error when creating an offer");
        });
    }
});

//when somebody sends us an offer
function handleOffer(offer, name) {
    //如果没创建RTCPeerConnection,需要重新创建连接对象，否则不需要
    if(RTCPeerConnectionCreated == false) {
        initPeer();
    }
    connectedUser = name;
    yourConn.setRemoteDescription(new RTCSessionDescription(offer));
    //create an answer to an offer
    yourConn.createAnswer(function (answer) {
        yourConn.setLocalDescription(answer);
        sendJson({
            type: "answer",
            answer: answer
        });
    }, function (error) {
        alert("Error when creating an answer");
    });
};

//when we got an answer from a remote user
function handleAnswer(answer) {
    yourConn.setRemoteDescription(new RTCSessionDescription(answer));
};

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
    yourConn.addIceCandidate(new RTCIceCandidate(candidate));
};

//hang up
hangUpBtn.addEventListener("click", function () {
    sendJson({
        type: "leave"
    });
    handleLeave();
});

function handleLeave() {
    //attention sequence
    connectedUser = null;
    remoteVideo.src = null;
    yourConn.close();
    yourConn.onicecandidate = null;
    yourConn.onaddstream = null;

    RTCPeerConnectionCreated = false;

};

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
    "iceServers": [{ "url": "stun:stun2.1.google.com:19302" }]
};
//**********************
//Init a peer connection
//**********************
function initPeer()
{

    yourConn = new RTCPeerConnection(configuration);
    //**********************
    //Register event process needed
    //**********************
    // setup stream listening
    yourConn.addStream(stream);
    //when a remote user adds stream to the peer connection, we display it
    yourConn.onaddstream = function (e) {
        //remoteVideo.srcObject = window.URL.createObjectURL(e.stream);
        remoteVideo.srcObject = e.stream;
    };
    //when a remote user removes stream to the peer connection, we display it
    yourConn.onremovestream = function (e) {
        console.log('Remote stream removed. Event: ', e);
    }
    // Setup ice handling
    yourConn.onicecandidate = function (event) {
        if (event.candidate) {
            sendJson({
                type: "candidate",
                candidate: event.candidate
            });
        }
    };

    RTCPeerConnectionCreated = true;

}