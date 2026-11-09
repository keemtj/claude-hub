# preview-mod

**한국어** | [English](README.en.md)

프롬프트에 붙이거나 끌어다 놓은 이미지(`[Image #N]`)와 긴 글(`[Pasted text #N +M lines]`)을 옆 패널에서 미리 보여 준다. 무언가를 붙이면 패널이 자동으로 열리고, 프롬프트에서 지우거나 보내면 목록에서 빠진다. 세션마다 따로 동작한다.

- 이미지: Claude Code가 붙이는 순간 세션 임시 폴더에 저장하는 `images/<N>` 파일을 읽어 그린다. 붙여넣기와 Finder에서 끌어다 놓기가 모두 된다. 폭은 32칸으로 고정하고 높이는 비율대로 정한다.
- 글: 붙인 순간의 클립보드에서 읽고(Claude Code는 보낼 때 저장한다), 줄 수가 자리 표시와 맞을 때만 보여 준다. 최대 4줄까지 보여 주고 나머지는 "… K줄 더"로 표시한다.
- 그림을 못 그리는 터미널: 엔진이 알려 주면 칸 블록 썸네일로 그린다.
- 패널 한 장의 그림 데이터는 합계 2 MiB까지라, 이미지가 많으면 해상도만 나눠 낮춘다(화면 크기는 그대로).
- 필요한 것: macOS의 `sips`(이미지 변환), 클립보드 명령(`pbpaste`, Linux는 `wl-paste`나 `xclip`).

```sh
claude plugin install preview-mod@claude-hub
```

`/preview-mod`로 열고 `/preview-mod close`로 닫는다.
