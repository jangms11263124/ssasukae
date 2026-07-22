package com.ssafy.ssasukae.integration.aws;

public enum S3AssetFolder {
    COVER_IMAGE("cover"),
    LYRICS("lyrics"),
    MR("mr"),
    MIDI("midi");

    private final String fileName;

    S3AssetFolder(String fileName) {
        this.fileName = fileName;
    }

    public String getFileName() {
        return fileName;
    }
}
