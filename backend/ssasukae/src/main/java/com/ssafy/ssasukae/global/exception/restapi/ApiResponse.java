package com.ssafy.ssasukae.global.exception.restapi;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;

@AllArgsConstructor(access = AccessLevel.PRIVATE)
@JsonPropertyOrder({"success", "data", "errors"})
public class ApiResponse<T> {
    @JsonProperty("success")
    private boolean success;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonProperty("data")
    private final T data;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonProperty("errors")
    private final ErrorResponse errors;

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null);
    }

    public static ApiResponse ok() {
        return new ApiResponse<Void>(true, null, null);
    }

    public static ApiResponse of(ErrorResponse errors) {
        return new ApiResponse<Void>(false, null, errors);
    }
}
