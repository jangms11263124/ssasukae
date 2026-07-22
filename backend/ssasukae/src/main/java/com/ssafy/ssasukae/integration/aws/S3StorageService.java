package com.ssafy.ssasukae.integration.aws;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;

@Service
@RequiredArgsConstructor
public class S3StorageService {

    private static final Duration PRESIGNED_URL_DURATION = Duration.ofMinutes(10);

    private final S3Client s3Client;
    private final S3Presigner s3Presigner;
    private final AwsS3Properties awsS3Properties;

    public String upload(MultipartFile file, Long songId, S3AssetFolder assetType) {
        String key = "songs/" + songId + "/" + assetType.getFileName() + extractExtension(file.getOriginalFilename());
        putObject(file, key);
        return key;
    }

    public void delete(String key) {
        deleteObject(key);
    }

    public String presignedUrl(String key) {
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(awsS3Properties.getS3().getBucket())
                .key(key)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(PRESIGNED_URL_DURATION)
                .getObjectRequest(getObjectRequest)
                .build();

        PresignedGetObjectRequest presignedRequest = s3Presigner.presignGetObject(presignRequest);
        return presignedRequest.url().toString();
    }

    private void putObject(MultipartFile file, String key) {
        PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                .bucket(awsS3Properties.getS3().getBucket())
                .key(key)
                .contentType(file.getContentType())
                .build();

        try {
            s3Client.putObject(putObjectRequest, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
        } catch (IOException e) {
            throw new UncheckedIOException("S3 업로드 중 파일을 읽지 못했습니다.", e);
        }
    }

    private void deleteObject(String key) {
        DeleteObjectRequest deleteObjectRequest = DeleteObjectRequest.builder()
                .bucket(awsS3Properties.getS3().getBucket())
                .key(key)
                .build();

        s3Client.deleteObject(deleteObjectRequest);
    }

    private String extractExtension(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }

        int dotIndex = originalFilename.lastIndexOf('.');
        return dotIndex >= 0 ? originalFilename.substring(dotIndex) : "";
    }
}
