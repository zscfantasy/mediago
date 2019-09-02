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
    //connection表示当前连接的from
    //users[data.name]表示当前连接的to
    console.log("One user connected");
    if(Object.getOwnPropertyNames(users).length >= 2){
        //给连接的客户端返回信息，并关闭这个客户端本身
        sendToClient(connection, {
            type: "sendinfo",
            info: "超过最大连接数<br>（设计为点对点，只允许两个用户连接websocket）",
            close: true

        });
        //return;
    }

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
                //不允许重复用户名登进服务器if anyone is logged in with this username then refuse
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
                //判断要连接的用户在用户连接列表里面是否存在已经和服务器创建了连接，如果不存在则返回。
                if(conn != null) {
                    //setting that UserA connected with UserB
                    connection.otherName = data.name;
                    sendToClient(conn, {
                        type: "offer",
                        offer: data.offer,
                        name: connection.name
                    });
                }else{
                    //要连接的用户不存在！！！
                    //否则直接给发送方返回要连接的用户不存在的消息
                    sendToClient(connection, {
                        type: "sendinfo",
                        info: "user not exist",
                        close: false
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
            case "cmd":
                console.log('I want to cmd User:', data.name);
                var conn = users[data.name];
                if(conn != null) {
                    console.log('Server sended');
                    sendToClient(conn, {
                        type: "cmd",
                        sender: connection.name
                    });
                }
                break;
            case "sendinfo":
                var conn = users[data.name];
                if(conn != null) {
                    sendToClient(conn, {
                        type: "sendinfo",
                        info: data.info,
                        close: data.close
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
        console.log("One user disconnected");
        if(connection.name) {
            delete users[connection.name];
            if(connection.otherName) {
                console.log("Disconnecting from ", connection.otherName);
                var conn = users[connection.otherName];
                //conn.otherName = null;//delete from here
                if(conn != null) {
                    conn.otherName = null;//put here
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