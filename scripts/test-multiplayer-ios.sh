#!/usr/bin/env bash
set -euo pipefail

credential_file="${E2E_CREDENTIAL_FILE:-.e2e/credentials}"
if [[ -f "${credential_file}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${credential_file}"
  set +a
fi

if [[ -z "${E2E_HOST_EMAIL:-}" || -z "${E2E_HOST_USERNAME:-}" \
  || -z "${E2E_GUEST_EMAIL:-}" || -z "${E2E_GUEST_USERNAME:-}" \
  || -z "${E2E_TEST_PASSWORD:-}" ]]; then
  run_id="$(date +%s)"
  test_password="ICallOnE2E-$(openssl rand -hex 16)"
  umask 077
  mkdir -p "$(dirname "${credential_file}")"
  {
    printf 'E2E_HOST_EMAIL=icallon-e2e-host-%s@example.test\n' "${run_id}"
    printf 'E2E_HOST_USERNAME=E2EHost%s\n' "${run_id}"
    printf 'E2E_GUEST_EMAIL=icallon-e2e-guest-%s@example.test\n' "${run_id}"
    printf 'E2E_GUEST_USERNAME=E2EGuest%s\n' "${run_id}"
    printf 'E2E_TEST_PASSWORD=%s\n' "${test_password}"
  } > "${credential_file}"
  set -a
  # shellcheck disable=SC1090
  source "${credential_file}"
  set +a
  echo "Generated dedicated test credentials in ${credential_file}."
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

project_url="${EXPO_PUBLIC_SUPABASE_URL:-}"
public_key="${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}}"
if [[ -z "${project_url}" || -z "${public_key}" ]]; then
  echo "The public Supabase URL and publishable key are required in .env." >&2
  exit 1
fi

provision_user() {
  local email="$1"
  local username="$2"
  local response_file
  local response_code
  local error_code

  response_file="$(mktemp /private/tmp/icallon-auth-response.XXXXXX)"
  response_code="$(curl -sS --retry 4 --retry-all-errors --connect-timeout 10 \
    -o "${response_file}" -w '%{http_code}' \
    "${project_url}/auth/v1/signup" \
    -H "apikey: ${public_key}" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg email "${email}" --arg password "${E2E_TEST_PASSWORD}" \
      --arg username "${username}" \
      '{email: $email, password: $password, data: {username: $username}}')")"
  error_code="$(jq -r '.error_code // empty' "${response_file}")"

  if [[ "${response_code}" == "200" && "$(jq -r '.user.id // empty' "${response_file}")" != "" ]]; then
    rm -f -- "${response_file}"
    return
  fi
  if [[ "${error_code}" == "user_already_exists" ]]; then
    rm -f -- "${response_file}"
    return
  fi

  echo "Could not provision ${username} (HTTP ${response_code}, ${error_code:-unknown error})." >&2
  rm -f -- "${response_file}"
  exit 1
}

provision_user "${E2E_HOST_EMAIL}" "${E2E_HOST_USERNAME}"
provision_user "${E2E_GUEST_EMAIL}" "${E2E_GUEST_USERNAME}"

maestro_bin="${MAESTRO_BIN:-${HOME}/.maestro/bin/maestro}"
if [[ ! -x "${maestro_bin}" ]]; then
  echo "Maestro is required at ${maestro_bin}." >&2
  exit 1
fi

host_device="${E2E_HOST_DEVICE:-$(xcrun simctl list devices booted | sed -n 's/.*iPhone 17 Pro (\([0-9A-F-]*\)) (Booted).*/\1/p' | head -1)}"
guest_device="${E2E_GUEST_DEVICE:-$(xcrun simctl list devices booted | sed -n 's/.*ICallOn Guest (\([0-9A-F-]*\)) (Booted).*/\1/p' | head -1)}"

if [[ -z "${host_device}" || -z "${guest_device}" || "${host_device}" == "${guest_device}" ]]; then
  echo "Two distinct booted iOS simulators are required." >&2
  exit 1
fi

dev_client_url="${E2E_DEV_CLIENT_URL:-exp+icallon://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A19000}"
artifact_root="${E2E_ARTIFACT_DIR:-artifacts/multiplayer-ios}"
if [[ "${artifact_root}" != /* ]]; then
  artifact_root="$(pwd)/${artifact_root}"
fi
mkdir -p "${artifact_root}"

run_flow() {
  local device="$1"
  local flow="$2"
  shift 2
  MAESTRO_CLI_NO_ANALYTICS=1 "${maestro_bin}" --device "${device}" test \
    --test-output-dir "${artifact_root}/$(basename "${flow}" .yaml)" \
    "$@" "${flow}"
}

common_host=(
  -e "HOST_EMAIL=${E2E_HOST_EMAIL}"
  -e "HOST_USERNAME=${E2E_HOST_USERNAME}"
  -e "TEST_PASSWORD=${E2E_TEST_PASSWORD}"
)
common_guest=(
  -e "GUEST_EMAIL=${E2E_GUEST_EMAIL}"
  -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}"
  -e "TEST_PASSWORD=${E2E_TEST_PASSWORD}"
)

run_flow "${host_device}" e2e/multiplayer/host-setup.yaml \
  -e "DEV_CLIENT_URL=${dev_client_url}" "${common_host[@]}"

hierarchy="$(MAESTRO_CLI_NO_ANALYTICS=1 "${maestro_bin}" --device "${host_device}" hierarchy --compact)"
room_code="$(printf '%s\n' "${hierarchy}" | sed -n 's/.*accessibilityText=\([A-HJ-NP-Z2-9][A-HJ-NP-Z2-9]*\);.*resource-id=room-code.*/\1/p' | head -1)"
if [[ ! "${room_code}" =~ ^[A-HJ-NP-Z2-9]{6}$ ]]; then
  echo "Could not read the room code from the host simulator." >&2
  exit 1
fi

run_flow "${guest_device}" e2e/multiplayer/guest-setup.yaml \
  -e "DEV_CLIENT_URL=${dev_client_url}" -e "ROOM_CODE=${room_code}" \
  -e "HOST_USERNAME=${E2E_HOST_USERNAME}" "${common_guest[@]}"

letters=(A B C)
names=(Alice Bella Chloe)
animals=(Ant Bear Cat)
places=(Athens Berlin Cairo)
things=(Anchor Book Candle)

play_round() {
  local index="$1"
  local guest_pid

  run_flow "${guest_device}" e2e/multiplayer/guest-submit-round.yaml \
    -e "ANSWER_NAME=${names[$index]}" -e "ANSWER_ANIMAL=${animals[$index]}" \
    -e "ANSWER_PLACE=${places[$index]}" -e "ANSWER_THING=${things[$index]}" &
  guest_pid=$!

  run_flow "${host_device}" e2e/multiplayer/host-start-round.yaml \
    -e "ROUND_LETTER=${letters[$index]}"

  if ! wait "${guest_pid}"; then
    echo "The guest could not submit round $((index + 1))." >&2
    return 1
  fi
}

for index in 0 1; do
  play_round "${index}"
  run_flow "${host_device}" e2e/multiplayer/host-review-round.yaml \
    -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}"
done

index=2
play_round "${index}"
run_flow "${host_device}" e2e/multiplayer/host-finish-game.yaml \
  -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}"
run_flow "${guest_device}" e2e/multiplayer/guest-results.yaml \
  -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}"

xcrun simctl io "${host_device}" screenshot "${artifact_root}/host-leaderboard.png"
xcrun simctl io "${guest_device}" screenshot "${artifact_root}/guest-leaderboard.png"

run_flow "${guest_device}" e2e/multiplayer/guest-rematch.yaml \
  -e "ROOM_CODE=${room_code}" -e "HOST_USERNAME=${E2E_HOST_USERNAME}" \
  -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}" &
guest_rematch_pid=$!

run_flow "${host_device}" e2e/multiplayer/host-rematch.yaml \
  -e "ROOM_CODE=${room_code}" -e "HOST_USERNAME=${E2E_HOST_USERNAME}" \
  -e "GUEST_USERNAME=${E2E_GUEST_USERNAME}"

if ! wait "${guest_rematch_pid}"; then
  echo "The guest did not follow the room into the rematch lobby." >&2
  exit 1
fi

xcrun simctl io "${host_device}" screenshot "${artifact_root}/host-rematch-lobby.png"
xcrun simctl io "${guest_device}" screenshot "${artifact_root}/guest-rematch-lobby.png"
echo "Three-round, two-device multiplayer and instant rematch flow passed."
