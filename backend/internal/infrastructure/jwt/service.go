package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/richard/my-rent-go/internal/application/auth"
	domainuser "github.com/richard/my-rent-go/internal/domain/user"
)

type Service struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
	issuer     string
}

func NewService(secret string, accessTTL, refreshTTL time.Duration, issuer string) *Service {
	return &Service{
		secret:     []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
		issuer:     issuer,
	}
}

type accessClaims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	OrgID  string `json:"org_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func (s *Service) GeneratePair(u *domainuser.User) (*auth.TokenPair, error) {
	orgID := ""
	role := domainuser.RoleViewer
	if len(u.Organizations) > 0 {
		orgID = u.Organizations[0].OrganizationID
		role = u.Organizations[0].Role
	}

	now := time.Now().UTC()
	accessClaims := accessClaims{
		UserID: u.ID,
		Email:  u.Email,
		OrgID:  orgID,
		Role:   string(role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    s.issuer,
			Subject:   u.ID,
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	access, err := token.SignedString(s.secret)
	if err != nil {
		return nil, err
	}

	refresh := uuid.New().String()
	return &auth.TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.accessTTL.Seconds()),
	}, nil
}

func (s *Service) ValidateAccess(tokenStr string) (*auth.Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &accessClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*accessClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return &auth.Claims{
		UserID: claims.UserID,
		Email:  claims.Email,
		OrgID:  claims.OrgID,
		Role:   domainuser.Role(claims.Role),
	}, nil
}

func (s *Service) Refresh(refreshToken string) (*auth.TokenPair, error) {
	_ = refreshToken
	return nil, errors.New("not implemented")
}

const mfaTokenTTL = 5 * time.Minute

type mfaClaims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Type   string `json:"typ"`
	jwt.RegisteredClaims
}

func (s *Service) GenerateMFAToken(userID, email string) (string, error) {
	now := time.Now().UTC()
	claims := mfaClaims{
		UserID: userID,
		Email:  email,
		Type:   "mfa",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(mfaTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    s.issuer,
			Subject:   userID,
			ID:        uuid.New().String(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

func (s *Service) ValidateMFAToken(tokenStr string) (userID, email string, err error) {
	token, err := jwt.ParseWithClaims(tokenStr, &mfaClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return "", "", err
	}
	claims, ok := token.Claims.(*mfaClaims)
	if !ok || !token.Valid || claims.Type != "mfa" {
		return "", "", errors.New("invalid mfa token")
	}
	return claims.UserID, claims.Email, nil
}

func (s *Service) GeneratePairStrings(u *domainuser.User) (accessToken, refreshToken string, expiresIn int64, err error) {
	pair, err := s.GeneratePair(u)
	if err != nil {
		return "", "", 0, err
	}
	return pair.AccessToken, pair.RefreshToken, pair.ExpiresIn, nil
}
