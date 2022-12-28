# auto-streaming-stt

Raspberry Pi appliance to automatically stream audio to a speech-to-text service

## Installation

Requires ALSA and sox. Set your audio input as the default input.

```
apt install sox
```

## rec command

This tool uses the following command to strip silence from the input.

```
sox -t alsa hw:0 -c 1 -b 16 -r 8000 -e signed-integer -t raw - silence 1 0.5 0.1% 1 0.5 0.1%
```
