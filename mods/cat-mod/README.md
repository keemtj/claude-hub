# cat-mod

`/cat-mod`로 옆 패널을 열면 고양이 GIF를 보여 준다. `새로고침`을 누르면 다른 고양이로 바뀐다.

- 출처: GIPHY API 키를 넣으면 GIPHY에서 `cat`을 검색해 상위 1,000개 중 하나를 무작위로 보여 주고 제목을 아래에 쓴다. 키가 없으면 [cataas.com](https://cataas.com)의 `/cat/gif/says/<문구>`로 고양이에 문구를 얹는다(문구 목록은 `hooks/phrases.ts`).
- 키 넣기: [developers.giphy.com](https://developers.giphy.com)에서 API 키(무료 beta, 시간당 100회)를 받아 `/plugin configure cat-mod@claude-hub`로 넣는다. `userConfig`의 비밀 값이라 키체인에 저장된다. 공유받은 사람도 설치할 때 자기 키를 넣는다.
- 그리기: GIF를 mod 안에서 직접 풀어(`hooks/gif.ts`) 프레임마다 `Image`를 바꿔 끼운다. 프레임은 압축 없이 터미널로 가므로 폭 128px, 초당 8장 이하로 줄여 보낸다. GIPHY에서는 폭 100px 버전(`fixed_width_small`)을 받고, 그림은 패널 폭과 상관없이 32칸으로 고정한다(320px·초당 14장이었을 때 Orca 전체가 느려졌다). GIPHY 키 없이 Orca 안이거나(`TERM_PROGRAM=Orca`: GIPHY GIF는 작고 짧아서 Orca에서도 그림으로 재생한다. cataas GIF는 크고 프레임이 많아, 모든 탭의 그림을 풀어 그리는 Orca 화면 프로세스의 CPU가 재생 중 18~97%까지 올랐다) 터미널이 그림을 못 그리면(대체 문구가 그려지면) 반칸 블록 `Raster`로 바꿔 그리고, 이때는 문구 없는 고양이를 받아 문구를 아래에 글자로 쓴다.
- 4MB가 넘는 GIF는 건너뛰고 다른 고양이를 받는다(최대 세 번). `/cat-mod close`로 닫는다.

```sh
claude plugin install cat-mod@claude-hub
```
