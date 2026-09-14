# Three.js GLB Viewer

GLB를 파일 선택 또는 drag-and-drop으로 열고 검사하는 독립 웹 화면입니다.
Node.js 22.12 이상에서 `npm ci`와 `npm run dev`로 실행합니다.

## 사용

- 드래그로 회전, 우클릭 드래그로 이동, 스크롤로 확대합니다. F 키로 모델에 맞춥니다.
- Grid, Bounds, Wireframe 및 선택형 outline으로 형상을 확인합니다.
- `?asset=/path/model.glb`로 같은 origin의 GLB를 열면 1.5초마다 변경 여부를 확인합니다.
- 파일 선택으로 연 GLB는 브라우저 안에서 읽으며 업로드하지 않습니다.
- `?lighting=portrait`로 portrait 조명을 사용할 수 있습니다.
- `?lighting=reference-colors`는 imported unlit 재질의 색 검토를 위한 표시 옵션입니다.

## 제한된 캐릭터 검토

Pose/Expression 메뉴는 지원하는 정확한 본·morph 이름이 있을 때만 활성화됩니다.
기존 VRM 계열 head/neck 본 및 지정된 morph에 대한 수동 검토 기능이며 범용 리타게팅,
모든 모델의 애니메이션 재생 또는 표정 품질 검증 기능이 아닙니다.
지원하지 않는 항목은 비활성화됩니다. Neutral은 조절했던 값들을 불러왔을 때의 상태로 복구합니다.

Quick checks는 실제 로드된 장면의 기본 측정치입니다. Python 백엔드나 별도 최종 판정 서비스는 없습니다.
렌더링은 화면·카메라·모델이 변경될 때 수행하며 device pixel ratio는 최대 2입니다.

## 개발 확인

```bash
npm run check
```

뷰어 자체의 회귀 테스트와 TypeScript/Vite 빌드를 확인합니다.
실제 브라우저 GLB 확인에는 실행 중인 뷰어와 Chrome/Chromium이 필요합니다.

```bash
node scripts/verify-render.mjs \
  --url 'http://127.0.0.1:5173/?asset=/model.glb' \
  --browser '/path/to/chrome' \
  --screenshot /tmp/viewer-preview.png
```

URL의 GLB는 별도로 제공해야 합니다. 스크립트는 모델 해시, 장면 측정치, 실제 렌더 흔적과
브라우저 오류를 확인하고 4뷰 미리보기를 저장합니다. 외형 품질이나 완성된 게임 지원을 판정하지 않습니다.
