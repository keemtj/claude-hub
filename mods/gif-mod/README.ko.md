# gif-mod

[English](README.md) | **한국어**

`/gif-mod`로 옆 패널을 열면 GIF를 보여 준다. 기본은 고양이다. `새로고침`을 누르면 같은 검색어로 다른 GIF를 보여 준다.

- 검색: `/gif-mod <검색어>`로 찾거나, 패널의 검색 입력란에 쓰고 엔터를 누른다. 비워서 검색하면 `cat`으로 돌아간다. 마지막 검색어는 다음 세션에도 이어서 쓴다(`$.store`). 한글이 든 검색어는 GIPHY에 한국어로 묻는다(`lang=ko`). 검색은 GIPHY 키가 있어야 하며, 키가 없으면 패널에 그렇게 알리고 고양이를 보여 준다.

- 출처: GIPHY API 키를 넣으면 GIPHY에서 지금 검색어(기본 `cat`)로 검색해 상위 1,000개 중 하나를 무작위로 보여 주고 제목을 아래에 쓴다. 키가 없으면 [cataas.com](https://cataas.com)의 `/cat/gif/says/<문구>`로 고양이에 문구를 얹는다(문구 목록은 `hooks/phrases.ts`).
- 키 넣기: [developers.giphy.com](https://developers.giphy.com)에서 API 키(무료 beta, 시간당 100회)를 받아 `/plugin configure gif-mod@claude-hub`로 넣는다. `userConfig`의 비밀 값이라 키체인에 저장된다. 공유받은 사람도 설치할 때 자기 키를 넣는다.
- 그리기: GIF를 mod 안에서 직접 풀어(`hooks/gif.ts`) 프레임마다 `Image`를 바꿔 끼운다. 프레임은 압축 없이 터미널로 가므로 폭 128px, 초당 8장 이하로 줄여 보낸다. GIPHY에서는 폭 100px 버전(`fixed_width_small`)을 받고, 그림은 패널 폭과 상관없이 32칸으로 고정한다(320px·초당 14장이었을 때 Orca 전체가 느려졌다). GIPHY 키 없이 Orca 안이거나(`TERM_PROGRAM=Orca`: GIPHY GIF는 작고 짧아서 Orca에서도 그림으로 재생한다. cataas GIF는 크고 프레임이 많아, 모든 탭의 그림을 풀어 그리는 Orca 화면 프로세스의 CPU가 재생 중 18~97%까지 올랐다) 터미널이 그림을 못 그리면(대체 문구가 그려지면) 반칸 블록 `Raster`로 바꿔 그리고, 이때는 문구 없는 고양이를 받아 문구를 아래에 글자로 쓴다.
- 4MB가 넘는 GIF는 건너뛰고 다른 고양이를 받는다(최대 세 번). `/gif-mod close`로 닫는다.

```sh
claude plugin install gif-mod@claude-hub
```

## 외부 서비스

이 mod의 코드는 저장소의 MIT 라이선스를 따른다. 보여 주는 GIF는 이 저장소에 들어 있지 않고 실행할 때 외부 서비스에서 받아 오며, 각 서비스의 약관을 따른다.

- GIPHY: [GIPHY API 약관](https://developers.giphy.com/docs/api)을 따른다. API 키는 저장소에 넣지 않고 사용자가 각자 발급받아 넣는다. 약관이 요구하는 출처 표시로 패널에 `Powered by GIPHY`를 쓴다. 무료 beta 키는 시간당 100회로 제한되고 개인 사용 용도다.
- cataas.com: 키 없이 쓰는 공개 고양이 API다.
