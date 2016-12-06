function slugify(str) {
	return str.replace(/\s+/g, "-")
			.toLowerCase()
}

var GameRound = {
	"controller": function(c) {
		return {
			select: function(e) {
				c.socket.emit("choice", { choice: e.target.selectedOptions[0].value });
			}
		}
	},
	"view": function(ctrl, c) {
		return m(".round", [
			m("h3", "What is the title of this WikiHow article?"),
			m("img.u-max-full-width", { src: "/images/" + c.round.img }),
			m("select.fw", { onchange: ctrl.select }, [
				m("option", { value: "default", selected: true, disabled: true, hidden: true }, "How to..."),
				c.round.pos.map(function(opt) {
					return m("option", { value: opt }, "How To " + opt)
				})
			])
		])
	}
}

var GameNotStartedWindow = {
	"view": function() {
		return m(".not-round", [
			m("h1", "Waiting for the game to start...")
		])
	}
}

var InBetweenRoundsWindow = {
	"view": function() {
		return m(".not-round", [
			m("h1", "Waiting for the next round...")
		])
	}
}

var EndOfRoundWindow = {
	"view": function(ctrl, c) {
		return m(".not-round", [
			m("h2", "Round over! The correct answer was ", m("b", "How To " + c.d.room.round.correct)),
			m("h3", "The following people guessed correctly:"),
			c.d.correct.map(function(u) {
				return m("p", u.name, m("small", "  [+1 Dumb Point]"))
			})
		])
	}
}

var GameWindow = {
	"controller": function(c) {
		var ctrl = {};

		c.room = window.dd_room;
		socket.on("joined room", function(room) {
			c.room = room;

			m.redraw();
		});

		if (!c.room) {
			c.socket.emit("join room", { id: m.route.param("room") });
		}

		c.socket.on("round", function(d) {
			ctrl.component = m.component(GameRound, { round: d, socket: c.socket });

			m.redraw();
		});

		c.socket.on("room update", function(d) {
			c.room = d.room;

			m.redraw();
		});

		c.socket.on("round end", function(d) {
			c.room = d.room;
			ctrl.component = m.component(EndOfRoundWindow, { d: d });

			m.redraw();
		})

		if (c.room) {
			if (c.room.round_num == 0) {
				ctrl.component = m.component(GameNotStartedWindow);
			} else {
				ctrl.component = m.component(InBetweenRoundsWindow);
			}
		}

		return ctrl;
	},
	"view": function(ctrl, c) {
		if (!c.room) {
			return m(".container", [
				m("h1", "Joining room...")
			])
		}

		return m(".container", [
			m(".row", [
				m(".twelve columns", [
					m("h2", "Room " + c.room.id),
					m("span", [
						m("b", "Owner: "),
						m("p", c.room.owner.name, m("small", "    [" + c.room.scores[c.room.owner.id] + "]"))
					]),
					m("span.playerlist", [
						m("b", "Players: "),
						m("br"),
						c.room.players.map(function(pl) {
							return m("p", pl.name, m("small", "    [" + c.room.scores[pl.id] + "]"));
						})
					])
				])
			]),
			m(".central row", [
				m(".twelve columns", ctrl.component)
			])
		])
	}
}

var CreateOrJoinWindow = {
	"controller": function() {
		return {
			user: function(name) {
				localStorage.username = name;
			},
			join: function(e) {
				var id = slugify(document.getElementById("joiner").value)
				socket.emit("join room", { id: id });
			}
		}
	},
	"view": function(ctrl, c) {
		return m(".container", [
			m(".row central vc", [
				m(".twelve columns", [
					m("h1", "Dumb Dog: Damn Dog With Friends"),
					m("input", { type: "text", placeholder: "Username", oninput: m.withAttr("value", ctrl.user) })
				])
			]),
			m(".row central", [
				m(".six columns bordered fh", [
					m("i.fa fa-plus-circle fa-5x"),
					m("p", "Create a room and invite some friends!"),
					m("a.button", { onclick: function(e) {
						socket.emit("create room");
					}}, "Create a Room")
				]),
				m(".six columns bordered fh", [
					m("i.fa fa-sign-in fa-5x"),
					m("p", "Join an already in-session room!"),
					m("input.u-full-width#joiner", { type: "text", placeholder: "Room ID" }),
					m("a.button button-primary", { onclick: ctrl.join }, "Join a Room")
				])
			])
		])
	}
}

var socket = io.connect();

socket.on("user", function(u) {
	localStorage.userid = u.id;

	socket.on("joined room", function(room) {
		window.dd_room = room;

		m.route("/rooms/" + room.id);
	});

	m.route(document.body, "/", {
		"/": m.component(CreateOrJoinWindow, { socket: socket }),
		"/rooms/:room": m.component(GameWindow, { socket: socket })
	});
});

socket.on("logout", function() {
	localStorage.removeItem("userid");

	socket.emit("new user", { name: localStorage.hasOwnProperty("username") ? localStorage.username : "Guest" });
});

socket.on("bad things", function(d) {
	alert(d.msg);
});

socket.on("redirect", function(d) {
	window.last_dc_reason = d.reason;
	m.route(d.place);
});

if (localStorage.hasOwnProperty("userid")) {
	socket.emit("login", { id: localStorage.userid, name: localStorage.username });
} else {
	socket.emit("new user", { name: localStorage.hasOwnProperty("username") ? localStorage.username : "Guest" });
}
