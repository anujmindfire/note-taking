export interface IUserResponse {
  id: string;
  email: string;
  createdAt: string;
}

export interface IAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: IUserResponse;
}

export interface IRegisterResponse {
  userId: string;
}

export interface IRefreshResponse {
  accessToken: string;
}

export interface INoteResponse {
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: ITagResponse[];
}

export interface ITagResponse {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface IErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: string[];
  };
}
