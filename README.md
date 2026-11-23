# LOADED DICE (웹 버전)

요트(Yacht) 룰 × 덱빌딩 로그라이크 — 기획서 기반 웹 구현.

사기(Loaded) 주사위를 굴려 족보 점수로 목표 스코어를 돌파하고,
보상과 상점에서 **주사위 / 와일드 페이스 / 리드미노**를 모아 빌드를 완성하는 게임.

## 실행 방법 (로컬)

정적 사이트이지만 ES 모듈을 사용하므로 HTTP 서버가 필요하다.

```bash
python -m http.server 8930
```

이후 브라우저에서 `http://localhost:8930` 접속. (인터넷 연결 필요 — three.js/cannon-es/폰트 CDN)

종료는 서버를 실행한 터미널에서 `Ctrl+C`.
창을 닫아 서버가 남아있다면 `netstat -ano | findstr :8930`으로 PID 확인 후 `taskkill /PID <PID> /F`.

## 배포 (GitHub Pages)

```bash
git init
git add .
git commit -m "LOADED DICE web build"
gh repo create loaded-dice --public --source=. --push
gh api repos/{owner}/loaded-dice/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

또는 저장소 Settings → Pages → `main` 브랜치 루트 선택.
Firebase Hosting을 쓸 경우 `firebase init hosting` 후 이 폴더를 public 디렉터리로 지정하면 된다.

## 구현 특징

| 요구사항 | 구현 |
| --- | --- |
| 물리 기반 주사위 | three.js + cannon-es. 시드 없이 **물리 시뮬레이션 결과**로 눈금 결정 |
| '사기 주사위' | 무게추 리드미노가 주사위 무게중심을 실제로 치우치게 함 (postStep 편심 중력) |
| 데이터베이스 | `js/data/db.js` — 족보 21종 / 주사위 8종 / 월드 룰 8종 / 로컬 룰 10종 / 와일드페이스 14종 / 리드미노 템플릿 6종 / 스테이지 테이블 |
| 이미지 | `tools/gen_assets.py` (Pillow) 픽셀아트 생성 + 런타임 캔버스 텍스처 |
| 점수 파이프라인 | 기본 족보 → 월드/로컬 룰 → 와일드페이스 → 리드미노 (기획서 순서) |
| 세이브 | localStorage. 월드 룰 확정 시 / 점수 기입 시 저장, 패배·포기·새 게임 시 삭제 |
| 해금 | 조건 달성 시 월드 룰/주사위/와일드페이스 해금 + 해금 연출 |

## 폴더 구조

```
index.html          화면 레이아웃 (메인/월드 선택/게임 공통)
css/style.css       선술집/도박장 픽셀 테마 (카페24 PRO UP + Galmuri11)
js/data/db.js       게임 데이터베이스 (룰/아이템/족보/스테이지)
js/engine/physics.js  물리 주사위 (three.js + cannon-es)
js/engine/scoring.js  점수 계산 파이프라인
js/engine/state.js    런 상태/세이브/해금/상점 생성
js/engine/audio.js    WebAudio 효과음 신시사이저
js/ui.js            화면/플로우 컨트롤러
js/tutorial.js      인터랙티브 튜토리얼 (하이라이트 + 말풍선 코치마크)
tools/gen_assets.py 픽셀아트 에셋 생성기 (재생성: python tools/gen_assets.py)
assets/             생성된 아이콘/배경
ROADMAP.md          개발 로드맵 (기획서 매핑)
```

## 조작

- **튜토리얼**: 첫 '시작하기' 때 자동으로 진행된다 (주인장의 안내 말풍선을 따라가면 됨). 메인 화면의 **튜토리얼** 버튼으로 언제든 다시 볼 수 있다
- **굴리기**: 버튼 또는 Space
- **주사위 배치(키프)**: 보드 위 **3D 주사위를 직접 클릭** → 뒤쪽 배치 칸(선반)으로 이동. 다시 클릭하면 굴림 결과 라인으로 복귀. 굴림 결과는 낮은 눈금 순으로 자동 정렬되고 각 주사위 위에 눈금 라벨 표시
- **점수 등록**: 점수판의 빈 족보 클릭 (초록 숫자 = 미리보기)
- **리드미노 배치**: 상점에서 가방의 리드미노 클릭 → 주사위 그리드 칸 클릭 (자동 회전)
- **강화/회수**: 상점에서 배치된 리드미노 클릭

## 기획서 대비 1차 범위 제외

다국어, 그래픽/키보드 설정, 컬렉션 상세 도감, 로컬 룰 분기 지도(→3지선다), 비육면체 주사위(→눈금 변형으로 대체), 모바일 터치 최적화.
