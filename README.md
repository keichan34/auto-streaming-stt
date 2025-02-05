# auto-streaming-stt

Raspberry Pi appliance to automatically stream audio to a speech-to-text service, use OpenAI APIs to summarize the content, and send notifications to clients using the [Web Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notification).

このプロジェクトは Raspberry Pi 上で実行することを前提とし、入力音声から自動文字起こしサービスにストリーミングし、 OpenAI API を使って要約し、 Web Notification API を使って通知を送信します。

鹿児島県屋久島町の防災放送に繋いだサンプルアプリケーションはこちらで確認できます: [https://bousai.yakushima.blog/](https://bousai.yakushima.blog/)

開発のきっかけ、流れなどに興味ある方はぜひ、下記のブログを参照してください。

* [防災放送をデジタル化してみた](https://keita.blog/2023/03/26/%E4%B9%85%E3%81%97%E3%81%B6%E3%82%8A%E3%81%AB%E5%9C%B0%E5%9B%B3%E3%81%A8%E9%96%A2%E4%BF%82%E3%81%AA%E3%81%84%E3%82%82%E3%81%AE%E3%82%92%E4%BD%9C%E3%82%8A%E3%81%BE%E3%81%97%E3%81%9F/)
* [防災放送をデジタル化してみた: 続き](https://keita.blog/2023/10/15/%E9%98%B2%E7%81%BD%E6%94%BE%E9%80%81%E3%82%92%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E5%8C%96%E3%81%97%E3%81%A6%E3%81%BF%E3%81%9F-%E7%B6%9A%E3%81%8D/)

## Installation

Requires ALSA, sox, and LAME. Set your audio input as the default input.

```
apt install sox lame
```

## rec command

This tool uses the following command to strip silence from the input.

```
sox -t alsa hw:0 -c 1 -b 16 -r 8000 -e signed-integer -t raw - silence 1 0.5 0.1% 1 0.5 0.1%
```

## Setup

See [INSTALL.md](./INSTALL.md)

* Google API authentication
* Server authentication
* OpenAI API authentication
