

export function withToken(){
	return {
		secret: process.env.TOKEN_PUBLIC_KEY,
		algorithms: ['RS256'],
	};
}

export function withoutToken(){
	return {
		credentialsRequired: false,
	};
}

export function withTokenFromHeaderOrQuery(){
	return {
		getToken(req){
			if (req.headers?.authorization?.split?.(" ")?.[0] === 'Bearer')
				return req.headers.authorization.split(" ")[1];
			if (req.query?.authorization && req.query?.authorization != 'null')
				return req.query.authorization;
			return null;
		}
	};
}

