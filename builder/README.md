# builder

DNF 스토리빌더 본 툴 (Python).

`editor/`(corpus·DB 입력 도구)와 분리된 별개 물건이다.
editor가 만든 산출물(`corpus/*.json`, SQLite)을 **입력**으로 받아,
사건 순서·상관관계·확신도를 확률 모델로 다룬다.

## 설계 방향
- 순서 불확실성: temporal-belief-graph 모델을 도메인 코어로 (벤더링 + 버전 핀)
- 확신도 전파: 필요 시 evidence-confidence-propagation 도입 (2순위)
- `event_chain.json`의 `sources`(dfu=ground truth / rrw·namu=보완)를 source weight로 사용

## 레이어 경계 (1파일1역할)
- `domain/`   : 순수 도메인. 외부 프레임워크 import 금지
- `io/`       : corpus/DB 로드·저장
- `vendor/`   : tbg 등 외부 패키지 동결 사본
- `const.py`  : 상수·소스 가중치 (하드코딩 금지 원칙)
- `cli.py`    : 진입점. 와이어링만

## 상태
스캐폴딩 단계. 도메인 모델은 검증 스파이크 후 확정.
