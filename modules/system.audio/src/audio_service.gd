extends Node

signal audio_ready()

const RATE := 22050
const SFX_POOL := 8

var initialized: bool = false

var _streams: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _music: AudioStreamPlayer

func _ready() -> void:
	Game.register_service("audio", self)
	_ensure_buses()
	_build_streams()
	_build_players()
	Game.events.event_emitted.connect(_on_event)
	var settings = Game.get_service("settings")
	if settings and not settings.changed.is_connected(_apply_settings):
		settings.changed.connect(_apply_settings)
	_apply_settings()
	if DisplayServer.get_name() != "headless":
		_music.play()
	initialized = true
	audio_ready.emit()

func _ensure_buses() -> void:
	for bus_name in ["Music", "SFX"]:
		var index := AudioServer.get_bus_index(bus_name)
		if index < 0:
			AudioServer.add_bus()
			index = AudioServer.bus_count - 1
			AudioServer.set_bus_name(index, bus_name)
			AudioServer.set_bus_send(index, "Master")

func _build_players() -> void:
	_music = AudioStreamPlayer.new()
	_music.name = "Music"
	_music.bus = "Music"
	_music.stream = _streams.get("music", null)
	add_child(_music)
	for index in range(SFX_POOL):
		var player := AudioStreamPlayer.new()
		player.name = "Sfx%d" % index
		player.bus = "SFX"
		add_child(player)
		_players.append(player)

func _build_streams() -> void:
	_streams["hit"] = _make_sequence([180.0], 0.08, 0.5)
	_streams["pickup"] = _make_sequence([880.0], 0.09, 0.35)
	_streams["level_up"] = _make_sequence([523.25, 783.99], 0.1, 0.35)
	_streams["cast"] = _make_sequence([440.0], 0.12, 0.4)
	_streams["quest"] = _make_sequence([659.25, 880.0], 0.1, 0.35)
	_streams["win"] = _make_sequence([523.25, 659.25, 783.99], 0.12, 0.4)
	_streams["lose"] = _make_sequence([220.0, 164.81], 0.15, 0.4)
	_streams["talk"] = _make_sequence([700.0], 0.04, 0.15)
	if DisplayServer.get_name() != "headless":
		_streams["music"] = _make_music()

func _make_sequence(freqs: Array, note_duration: float, volume: float) -> AudioStreamWAV:
	var frames_per_note := int(note_duration * RATE)
	var total_frames := frames_per_note * freqs.size()
	var data := PackedByteArray()
	data.resize(total_frames * 2)
	for note_index in range(freqs.size()):
		var frequency := float(freqs[note_index])
		for frame in range(frames_per_note):
			var t := float(frame) / RATE
			var attack := minf(1.0, t / 0.005)
			var release := minf(1.0, (note_duration - t) / 0.02)
			var sample := sin(TAU * frequency * t) * attack * release * volume
			var offset := (note_index * frames_per_note + frame) * 2
			data.encode_s16(offset, int(clampf(sample, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	return stream

func _make_music() -> AudioStreamWAV:
	var duration := 4.0
	var frames := int(duration * RATE)
	var data := PackedByteArray()
	data.resize(frames * 2)
	for frame in range(frames):
		var t := float(frame) / RATE
		var pulse := 0.7 + 0.3 * sin(TAU * 0.25 * t)
		var sample := (sin(TAU * 110.0 * t) + sin(TAU * 165.0 * t)) * 0.08 * pulse
		data.encode_s16(frame * 2, int(clampf(sample, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = frames
	return stream

func _apply_settings() -> void:
	var music := 0.3
	var sfx := 0.8
	var settings = Game.get_service("settings")
	if settings:
		music = float(settings.music_volume)
		sfx = float(settings.sfx_volume)
	_set_bus("Music", music)
	_set_bus("SFX", sfx)

func _set_bus(bus_name: String, value: float) -> void:
	var index := AudioServer.get_bus_index(bus_name)
	if index >= 0:
		AudioServer.set_bus_volume_db(index, linear_to_db(maxf(value, 0.0001)))

func _on_event(event_name: String, _payload: Variant) -> void:
	match event_name:
		"enemy.died":
			play_sfx("hit")
		"loot.dropped":
			play_sfx("pickup")
		"leveled_up":
			play_sfx("level_up")
		"skill.cast":
			play_sfx("cast")
		"quest.completed":
			play_sfx("quest")
		"game.won":
			play_sfx("win")
		"game.lost":
			play_sfx("lose")
		"dialogue.line":
			play_sfx("talk")

func play_sfx(name: String) -> bool:
	var stream = _streams.get(name, null)
	if stream == null or _players.is_empty():
		return false
	var player := _players[0]
	for candidate in _players:
		if not candidate.playing:
			player = candidate
			break
	player.stream = stream
	player.play()
	return true
