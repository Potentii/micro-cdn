import path from "path";


export function getCdnPathForUser(auth){
	return path.join(auth.location, process.env.CDN_FOLDER_NAME);
}


