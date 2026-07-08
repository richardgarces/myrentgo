package jwt

import domainuser "github.com/richard/my-rent-go/internal/domain/user"

// MFATokenBridge adapts JWT service for the MFA application layer.
type MFATokenBridge struct {
	*Service
}

func NewMFATokenBridge(s *Service) MFATokenBridge {
	return MFATokenBridge{Service: s}
}

func (b MFATokenBridge) GenerateMFAToken(userID, email string) (string, error) {
	return b.Service.GenerateMFAToken(userID, email)
}

func (b MFATokenBridge) ValidateMFAToken(token string) (userID, email string, err error) {
	return b.Service.ValidateMFAToken(token)
}

func (b MFATokenBridge) GeneratePair(u *domainuser.User) (accessToken, refreshToken string, expiresIn int64, err error) {
	return b.Service.GeneratePairStrings(u)
}
