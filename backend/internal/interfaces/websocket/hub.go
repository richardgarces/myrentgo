package websocket

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // validated at reverse proxy in production
	},
}

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*Client]bool
}

type Client struct {
	OrgID  string
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
}

type Message struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]map[*Client]bool)}
}

func (h *Hub) Register(orgID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[orgID] == nil {
		h.clients[orgID] = make(map[*Client]bool)
	}
	h.clients[orgID][client] = true
}

func (h *Hub) Unregister(orgID string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.clients[orgID]; ok {
		delete(clients, client)
		close(client.Send)
	}
}

func (h *Hub) Broadcast(orgID string, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients[orgID] {
		select {
		case client.Send <- data:
		default:
		}
	}
}

func (h *Hub) Handle(c *gin.Context) {
	orgID := c.Query("org_id")
	userID := c.Query("user_id")
	if orgID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "org_id required"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}

	client := &Client{OrgID: orgID, UserID: userID, Conn: conn, Send: make(chan []byte, 256)}
	h.Register(orgID, client)

	go client.writePump()
	go client.readPump(h)
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.Unregister(c.OrgID, c)
		if err := c.Conn.Close(); err != nil {
			slog.Debug("websocket close", "error", err)
		}
	}()
	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	defer func() {
		if err := c.Conn.Close(); err != nil {
			slog.Debug("websocket close", "error", err)
		}
	}()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}
