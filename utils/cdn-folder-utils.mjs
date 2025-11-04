import path from "path";

/**
 *
 * @param {string} location
 * @return {string}
 */
export function getCdnPathForUser(location){
	return path.join(location, process.env.CDN_FOLDER_NAME);
}


