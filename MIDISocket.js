import { EventEmitter } from "events"


export class MIDISocket {
    constructor(host) {
        this.host = host
        this.state = "closed"
        this.socket = null
        this.try_reconnect = true
        this.reconnect_timeout = 1000
        this.events = new EventEmitter()
        this.device_names = []
        this.all_device_names = new Set()
        this.device_channels = new Set()
    }


    connect() {
        this.socket = new WebSocket("ws://" + this.host)
        this.state = "connecting"

        // --- open ---
        this.socket.addEventListener("open", (event) => {
            this.state = "open"
            this.events.emit("open", event)
        });

        // --- close ---
        this.socket.addEventListener("close", (event) => {
            if (!event.wasClean && this.try_reconnect && this.state != "closing") {
                // Retry connection
                this.state = "reconnecting"
                setTimeout(() => {
                    this.connect()
                }, this.reconnect_timeout)
            } else {
                this.state = "closed"
                this.socket = null
                this.events.emit("close", event)
            }
        });

        // --- message ---
        this.socket.addEventListener("message", (event) => {
            const data = JSON.parse(event.data)
            this.events.emit("message", data)

            if (data.type == "device_list") {
                this.device_names = data.content.devices

                for (let device_name of this.device_names) {
                    this.all_device_names.add(device_name)
                }

                this.events.emit("device_list", this.device_names)

            } else if (data.type == "midi_data") {
                for (let channel of this.device_channels) {
                    if (channel.device_name == data.content.device_name) {
                        channel.events.emit("message", data.content)
                    }
                }
            }
        });

        // --- error ---
        this.socket.addEventListener("error", (event) => {
            if (this.socket) {
                this.socket.close()
            }
            this.events.emit("error", event)
        });
    }

    disconnect() {
        if (this.socket) {
            this.state = "closing"
            this.socket.close(1000)
        }
    }



    create_device_channel(initial_device_name = null) {
        const channel = new MIDISocketDeviceChannel(this, initial_device_name)
        this.device_channels.add(channel)
        return channel
    }

    remove_device_channel(channel) {
        this.device_channels.delete(channel)
        channel.active = false
    }

}

export class MIDISocketDeviceChannel {
    constructor(parent, device_name) {
        this.parent = parent
        this.device_name = device_name
        this.events = new EventEmitter()
        this.active = true
    }

    on_message(callback) {
        this.events.on("message", callback)
    }

    send(status, note_number, velocity) {
        if (!this.parent.socket || this.parent.state != "open" || !this.active) {
            throw new MIDISocketSendError("No open connection.")
        }

        this.parent.socket.send(JSON.stringify({
            "device_name": this.device_name,
            "status": status,
            "note_number": note_number,
            "velocity": velocity,
        }));
    }
}



export class MIDISocketError extends Error {
    constructor(...args) {
        super(...args)
        if (Error.captureStackTrace !== undefined) {
            Error.captureStackTrace(this, MIDISocketError)
        }
    }
}

export class MIDISocketSendError extends MIDISocketError {
    constructor(...args) {
        super(...args)
        if (Error.captureStackTrace !== undefined) {
            Error.captureStackTrace(this, MIDISocketSendError)
        }
    }
}