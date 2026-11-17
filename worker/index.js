import { handleRequest } from "../server/http.js";
import { files } from "./files.js";

export default {
  fetch(request, env) {
    return handleRequest(request, env.DB, file => files[file]);
  },
};
