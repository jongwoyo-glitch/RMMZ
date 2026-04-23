1. 플러그인 개선/수정 시, 프로젝트의 플러그인 폴더 내 백업 폴더를 만들고 기존 파일명에 마지막 수정날짜를 텍스트로 추가하여 최신 파일은 RMMZ 프로그래상에 활성화, 구버전은 백업 폴더 내에 보관처리할 것. 
2. 각 플러그인마다 관련 마크다운 문서파일 및 플러그인 내부 주석을 참고하여 플러그인 전체 구조와 의존성을 파악한 뒤에 작업할 것. 
3. 필요한 경우, js 플러그인 내부 수정/편집 혹은 새로 생성 이후 주석 생성과 마크다운 파일 최신화를 진행할 것.
4. SRPG_Core.js 편집 규칙:
   - SRPG_Core.js를 직접 수정하지 않는다. src/ 폴더의 소스 파일(SRPG_Data.js, SRPG_SM.js, SRPG_UI.js)을 수정한다.
   - 모듈 매핑은 src/MODULE_MAP.md를 참조한다.
   - 소스 파일 수정 시 Edit 도구를 사용하지 않는다. 반드시 python 패치 스크립트(bash 내 inline python)로 수정한다. (Edit 도구는 대형 파일 끝부분을 잘라먹는 버그가 있음)
   - 수정 후 반드시 `python src/build.py`를 실행한다. 빌드 스크립트가 concat + 구문 검증 + 소스 백업을 자동 수행한다.
   - 잘림 발생 시 backup/src_latest/에서 마지막 정상 빌드 시점으로 즉시 복원 가능하다.
5. 데이터 무결성 보호:
   - 대형 파일(JSON, HTML, JS)을 Write/Edit 도구로 직접 쓰지 않는다. 반드시 python/node 스크립트(bash 내)로 수정한다.
   - 파일 수정 후 반드시 `node validate.js`로 전수 검증을 실행한다.
   - 작업 시작 시 `node validate.js --backup`으로 백업+검증을 먼저 수행한다.
   - 손상 발견 시 `node validate.js --backup --fix`로 자동 수리를 시도한다.
   - backup/safe_copy/에 마지막 검증 통과 파일이 보관된다.
   - backup/data_snapshots/에 시점별 스냅샷이 최대 10개 유지된다.
   - 개발 중 `node watch_integrity.js` (감시시작.bat)를 띄워두면 파일 변경 시 즉시 검증+자동복원이 동작한다.
6. 데이터 파일 복원 금지 규칙:
   - Tilesets.json 등 사용자가 커스텀 편집한 데이터 파일을 스냅샷에서 통째로 복원하지 않는다.
   - 손상 수리는 `node validate.js --fix`의 자동 수리(잘린 JSON 닫기)만 사용한다.
   - 스냅샷에서 수동 복원이 필요한 경우, 반드시 사용자에게 확인을 받은 후 진행한다.
   - 특히 flags 배열, tilesetNames 등 사용자 커스텀 데이터가 포함된 필드는 덮어쓰지 않는다.
