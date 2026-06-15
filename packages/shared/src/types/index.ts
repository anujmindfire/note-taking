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
  color: string | null;
  noteCount: number;
  createdAt: string;
}

export interface INotesPageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IForgotPasswordRequest {
  email: string;
}

export interface IResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface IMessageResponse {
  message: string;
}

export interface IErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: string[];
  };
}

export interface ISearchResult extends INoteResponse {
  highlight: string;
}

export interface ISharedLinkResponse {
  id: string;
  noteId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
