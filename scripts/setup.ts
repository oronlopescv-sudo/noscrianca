import "./_env";
import { closeCentral } from "@/db/central";
import { bootstrapCentral } from "@/lib/services/bootstrap";

bootstrapCentral((m) => console.log(m))
  .then(() => console.log("BD central pronta."))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => closeCentral());
