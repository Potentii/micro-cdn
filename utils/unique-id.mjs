import * as uuid from "uuid";

export default class UniqueId{

	/**
	 *
	 * @param {{id:string}[]} allEntities
	 * @return {string}
	 */
	static newUniqueUUID(allEntities = []){
		let newId;
		do{
			newId = uuid.v4();
		} while (allEntities.some(e => e.id === newId));
		return newId;
	}

	/**
	 *
	 * @param {Map<string,*>} entitiesMap
	 * @param {?string} [preffix]
	 * @param {?string} [suffix]
	 * @return {*|string}
	 */
	static newUniqueUUIDUsingMap(entitiesMap, preffix = '', suffix = ''){
		let newId;
		do{
			newId = preffix + uuid.v4() + suffix;
		} while (entitiesMap.has(newId));
		return newId;
	}

	/**
	 *
	 * @param {Set<string>} idsSet
	 * @return {*|string}
	 */
	static newUniqueUUIDUsingSet(idsSet){
		let newId;
		do{
			newId = uuid.v4();
		} while (idsSet.has(newId));
		return newId;
	}

}