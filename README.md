# Game Asset Forge Viewer

GLB 모델을 브라우저에서 열고 확인하는 Three.js 웹 뷰어입니다.
기존 Blender/Python 제작 코드, 모델링 실험, 다운로드한 모델과 실험 산출물은 정리했습니다.

## 실행

Node.js 22.12 이상이 필요합니다.

```bash
cd viewer
npm ci
npm run dev
```

표시된 로컬 주소에서 **GLB 열기** 또는 drag-and-drop으로 모델을 엽니다.
선택한 GLB 파일은 브라우저에서 읽으며 서버에 업로드하지 않습니다.
모델 파일은 저장소에 포함하지 않습니다.

## 기능

- 카메라 회전·이동·확대, 모델에 맞추기
- 메시·삼각형·재질 수, 파일 크기와 치수 확인
- 그리드·bounds·wireframe 표시
- 같은 origin의 `?asset=/path/model.glb` 로딩 및 변경 감지
- 지원되는 본·morph 이름이 있을 때 제한된 포즈·표정 검토

뷰어의 측정과 표시 검사는 외형 품질, 리깅 완성도 또는 게임 엔진 호환성의 보증이 아닙니다.
이 저장소에는 에셋 생성기나 Python 검증 서버가 없습니다.

## 확인 및 빌드

```bash
npm --prefix viewer run check
```

웹 뷰어 회귀 테스트, 브라우저 확인 스크립트 문법 검사, TypeScript 검사와 Vite 빌드를 실행합니다.
배포용 정적 파일은 `viewer/dist/`에 생성됩니다. 상세 사용법은 [viewer/README.md](viewer/README.md)를 참고하세요.
