#!/usr/bin/env bash
# CI 전용: E2E 관리자 시나리오(portal-us4·us5)용 관리자 계정을 일회용 DB에 만든다.
# 1) backend API로 가입한다. 2) 일회용 MySQL 컨테이너에서 그 회원의 role을 SUPER_ADMIN으로 바꾼다.
# 운영·개발 DB에는 쓰지 않는다. 값은 워크플로가 주는 CI 전용 일회용 값이다.
#
# 필요한 환경 변수: E2E_BACKEND_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, MYSQL_CONTAINER, MYSQL_ROOT_PASSWORD, MYSQL_DATABASE
set -euo pipefail

: "${E2E_BACKEND_URL:?}" "${E2E_ADMIN_EMAIL:?}" "${E2E_ADMIN_PASSWORD:?}"
: "${MYSQL_CONTAINER:?}" "${MYSQL_ROOT_PASSWORD:?}" "${MYSQL_DATABASE:?}"
ORIGIN="${E2E_ORIGIN:-http://localhost:5173}"

terms_version="$(curl -fsS "$E2E_BACKEND_URL/api/v1/legal/terms" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.version))')"

body="$(E2E_TERMS_VERSION="$terms_version" node -e '
  const e = process.env;
  console.log(JSON.stringify({
    email: e.E2E_ADMIN_EMAIL, password: e.E2E_ADMIN_PASSWORD, nickname: "E2E 관리자",
    handle: "e2eadmin", agreeTerms: true, agreePrivacy: true, over14: true,
    termsVersion: e.E2E_TERMS_VERSION,
    // 005: 가입은 CAPTCHA가 필요하다. E2E backend는 BLOG_CAPTCHA_PROVIDER=test라 이 토큰을 통과시킨다.
    captchaToken: e.E2E_CAPTCHA_TOKEN || "e2e-pass",
  }));')"

response="$(curl -fsS -X POST "$E2E_BACKEND_URL/api/v1/auth/signup" \
  -H "Content-Type: application/json" -H "Origin: $ORIGIN" --data "$body")"
user_id="$(printf '%s' "$response" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Number(JSON.parse(s).result.userId)))')"

docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$MYSQL_CONTAINER" mysql -h127.0.0.1 -uroot "$MYSQL_DATABASE" \
  -e "UPDATE users SET role = 'SUPER_ADMIN' WHERE id = $user_id"
echo "E2E admin provisioned (user $user_id)"
