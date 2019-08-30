var express = require('express');
var http = require('http');
var WebSocketServer = require('ws').Server;

//服务端的app对象
var app = express();
//Express 初始化 app 作为 HTTP 服务器的回调函数
var server = http.Server(app);
server.listen(9090,function(){
    console.log('listening on *:9090');
});

//creating a websocket server at port 9091
var wss = new WebSocketServer({port: 9091});

//定义客户端界面的静态页面路径为client文件夹
app.use(express.static('monitor'));
//定义一个路由 / 来处理首页访问。
app.get('/',function(req,res){
    res.sendFile(__dirname + '/monitor/monitor.html');
});


//all connected to the server users
var users = {};

//when a user connects to our sever
wss.on('connection', function(connection) {

    console.log("User connected");
    //when server gets a message from a connected user
    connection.on('message', function(message) {
        var data;
        //accepting only JSON messages
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.log("Invalid JSON");
            data = {};
        }
        //switching type of the user message
        switch (data.type) {
            //when a user tries to login
            case "login":
                console.log("User logged", data.name);
                //if anyone is logged in with this username then refuse
                if(users[data.name]) {
                    sendToClient(connection, {
                        type: "login",
                        success: false
                    });
                } else {
                    //save user connection on the server
                    users[data.name] = connection;
                    connection.name = data.name;
                    sendToClient(connection, {
                        type: "login",
                        success: true
                    });
                }
                break;
            case "offer":
                //for ex. UserA wants to call UserB
                console.log("Sending offer to: ", data.name);
                //if UserB exists then send him offer details
                var conn = users[data.name];
                if(conn != null) {
                    //setting that UserA connected with UserB
                    connection.otherName = data.name;
                    sendToClient(conn, {
                        type: "offer",
                        offer: data.offer,
                        name: connection.name
                    });
                }
                break;
            case "answer":
                console.log("Sending answer to: ", data.name);
                //for ex. UserB answers UserA
                var conn = users[data.name];
                if(conn != null) {
                    connection.otherName = data.name;
                    sendToClient(conn, {
                        type: "answer",
                        answer: data.answer
                    });
                }
                break;
            case "candidate":
                console.log("Sending candidate to:",data.name);
                var conn = users[data.name];
                if(conn != null) {
                    sendToClient(conn, {
                        type: "candidate",
                        candidate: data.candidate
                    });
                }
                break;
            case "leave":
                console.log("Disconnecting from", data.name);
                var conn = users[data.name];
                conn.otherName = null;
                //notify the other user so he can disconnect his peer connection
                if(conn != null) {
                    sendToClient(conn, {
                        type: "leave"
                    });
                }
                break;
            default:
                sendToClient(connection, {
                    type: "error",
                    message: "Command not found: " + data.type
                });
                break;
        }
    });
    //when user exits, for example closes a browser window
    //this may help if we are still in "offer","answer" or "candidate" state
    connection.on("close", function() {
        if(connection.name) {
            delete users[connection.name];
            if(connection.otherName) {
                console.log("Disconnecting from ", connection.otherName);
                var conn = users[connection.otherName];
                conn.otherName = null;
                if(conn != null) {
                    sendToClient(conn, {
                        type: "leave"
                    });
                }
            }
        }
    });
    connection.send(JSON.stringify("I am server,you coonect to me now!"));
});

function sendToClient(connection, message) {
    connection.send(JSON.stringify(message));
}