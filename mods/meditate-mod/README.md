# meditate-mod

**한국어** | [English](README.en.md)

`/meditate-mod`로 켜면 프롬프트 바로 위 띠(엔진이 허락하는 최대 높이)에 점으로 찍은 별, 초승달, 고리 행성 사이를 떠다니는 우주인 Clawd를 그린다. `/meditate-mod off`로 끈다. 터미널 `Raster` 요소로 그리고 초당 10번 바뀐 칸만 다시 칠한다(토큰 사용 없음).

- Clawd는 Claude Code 로고 글리프(`▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝`)를 사분면 픽셀 단위로 풀어 옮겼고, 유리 헬멧을 씌웠다.
- 띠를 `[-]`로 접으면 엔진이 세션 동안 접힌 상태를 기억하고, mod는 이를 펼 수 없다. 접힌 띠는 프롬프트 위에 `▸ plugin panel hidden` 한 줄로 남으며, 이 줄을 클릭하면 펼쳐진다(단축키 `ctrl+x ctrl+a`는 띠에 그릴 내용이 있을 때만 동작한다). 끌 때는 접지 말고 `/meditate-mod off`를 쓴다.

```sh
claude plugin install meditate-mod@claude-hub
```

시험: `claude plugin test .`
