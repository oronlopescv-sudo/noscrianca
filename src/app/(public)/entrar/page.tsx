import { redirect } from "next/navigation";

// A entrada por código foi retirada: a lista de instituições está na página inicial.
export default function EntrarRedirect() {
  redirect("/");
}
