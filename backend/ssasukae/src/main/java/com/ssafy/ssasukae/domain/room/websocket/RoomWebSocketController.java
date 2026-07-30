package com.ssafy.ssasukae.domain.room.websocket;

import com.ssafy.ssasukae.domain.room.service.RoomService;
import com.ssafy.ssasukae.domain.room.websocket.request.HostChangeRequest;
import com.ssafy.ssasukae.domain.room.websocket.request.ParticipantChatRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.core.parameters.P;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class RoomWebSocketController {

    private final RoomService roomService;

    @MessageMapping("/rooms/{roomId}/chat")
    public void chat(@DestinationVariable Long roomId, @Valid @Payload ParticipantChatRequest request, Principal principal) {
        roomService.chat(roomId, request, principal);
    }

    @MessageMapping("/rooms/{roomId}/host-changed")
    public void hostChanged(@DestinationVariable Long roomId, @Payload HostChangeRequest request, Principal principal) {
        roomService.hostChange(roomId, request, principal);
    }

    @MessageMapping("/rooms/{roomId}/participants/{participantId}/kick")
    public void kickParticipant(@DestinationVariable Long roomId, @DestinationVariable Long participantId, Principal principal) {
        roomService.kickParticipant(roomId, participantId, Long.valueOf(principal.getName()));
    }
}
