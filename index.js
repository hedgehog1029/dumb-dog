var express = require("express"),
	hri = require("human-readable-ids").hri,
	sid = require("short-id-gen"),
	fs = require("fs"),
	socketio = require("socket.io");

var app = express()
var server = require("http").Server(app);
var io = socketio(server);

var rooms = {};
var users = {};
var images = {};
var questions = [];

app.use(express.static(__dirname + "/client"));
//app.use("/images", express.static(__dirname + "/images"));

app.get("/images/:id", (req, res) => {
	if (images[req.params.id]) {
		var file = images[req.params.id];

		fs.createReadStream(__dirname + "/images/" + file).pipe(res);
	} else {
		res.status(404).send("Image not found");
	}
})

function convertFilename(file) {
	return file.split(".")[0]
			.replace(/-/g, " ")
			.replace(/(?:^|\s)\S/g, function(a) {
				return a.toUpperCase();
			});
}

fs.readdir(__dirname + "/images", function(err, files) {
	files.forEach(file => {
		var imgid = hri.random()

		images[imgid] = file;
		questions.push({
			img: imgid,
			name: convertFilename(file)
		})
	})
})

function randomQuestion() {
	return questions[Math.floor(Math.random() * questions.length)];
}

function fetchRandomRound() {
	var q = randomQuestion();
	return { img: q.img, correct: q.name, choices: [q.name, randomQuestion().name, randomQuestion().name, randomQuestion().name].sort((a, b) => Math.random() > 0.5) };
}

function nextRound(room) {
	room.round_num++;
	room.round_choices = {};
	room.round = fetchRandomRound();
	room.round.playing = room.players;

	console.log("Next round for " + room.id);

	io.to(room.id).emit("round", {
		img: room.round.img,
		pos: room.round.choices
	});
}

function endRound(room) {
	var correct_people = room.players.filter(u => {
		return room.round_choices[u.id] == room.round.correct;
	});

	if (room.round_choices[room.owner.id] == room.round.correct) {
		correct_people.push(room.owner);
	}

	correct_people.forEach(u => {
		room.scores[u.id]++;
	});

	io.to(room.id).emit("round end", {
		correct: correct_people,
		room: room
	});

	setTimeout(function() {
		nextRound(room);
	}, 7000);
}

io.on("connection", socket => {
	socket.on("new user", payload => {
		var u = {
			id: sid.generate(10),
			name: payload.name
		};

		users[u.id] = u;
		socket.emit("user", u);
		socket.user = u;
	});

	socket.on("login", d => {
		var u = users[d.id];

		if (u != null) {
			if (d.name) {
				u.name = d.name;
			}

			socket.emit("user", u);
			socket.user = u;
		} else {
			socket.emit("logout");
			socket.user = {
				id: null,
				name: null
			}
		}
	})

	socket.on("create room", d => {
		var id = hri.random()

		rooms[id] = {
			id: id,
			round_num: 0,
			owner: socket.user,
			players: [],
			scores: { [socket.user.id]: 0 },
			round: {},
			round_choices: {}
		};

		if (socket.user.room) {
			socket.leave(socket.user.room);
			socket.emit("left room", { id: socket.user.room });
		}

		socket.user.room = id;
		socket.join(id);
		socket.emit("joined room", rooms[id]);
	});

	socket.on("join room", d => {
		if (rooms[d.id]) {
			if (rooms[d.id].players.find(p => p.id == socket.user.id)) {
				// do nothing whups
			} else {
				rooms[d.id].players.push(socket.user)
				rooms[d.id].scores[socket.user.id] = 0;

				if (socket.user.room) {
					socket.leave(socket.user.room);
					socket.emit("left room", { id: socket.user.room });
				}
			}

			socket.user.room = d.id;
			socket.join(d.id);
			socket.emit("joined room", rooms[d.id]);
			io.to(d.id).emit("room update", { room: rooms[d.id] });
		} else {
			socket.emit("redirect", { reason: "that room doesn't exist", place: "/" });
		}
	});

	socket.on("start game", d => {
		if (!socket.user.room) {
			socket.emit("bad things", { msg: "you're not in a room" });
			return;
		}

		if (rooms[socket.user.room].owner.id != socket.user.id) {
			socket.emit("bad things", { msg: "you're not the owner of this room" });
			return;
		}

		var room = rooms[socket.user.room];

		nextRound(room);
	});

	socket.on("admin end round", d => {
		if (!socket.user.room) {
			socket.emit("bad things", { msg: "you're not in a room" });
			return;
		}

		if (rooms[socket.user.room].owner.id != socket.user.id) {
			socket.emit("bad things", { msg: "you're not the owner of this room" });
			return;
		}

		var room = rooms[socket.user.room];

		endRound(room);
	})

	socket.on("choice", d => {
		if (!socket.user.room) {
			socket.emit("bad things", { msg: "you're not in a room" });
			return;
		}

		var room = rooms[socket.user.room];

		room.round_choices[socket.user.id] = d.choice;

		if (Object.keys(room.round_choices).length == room.round.playing.length + 1) {
			endRound(room);
		}
	});

	socket.on("error", (err) => {
		console.warn("Error supressed:")
		console.error(err)
	})
});

server.listen(1370);
console.log("Listening on ::1370");
