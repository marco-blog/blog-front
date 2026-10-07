import { data } from "react-router";

/** 없는·형식이 틀린 릴리스 노트 주소는 HTTP 404 화면 */
export const notFound = () => data(null, { status: 404 });
