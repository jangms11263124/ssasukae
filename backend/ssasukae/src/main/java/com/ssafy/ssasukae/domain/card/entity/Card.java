package com.ssafy.ssasukae.domain.card.entity;


import com.ssafy.ssasukae.domain.card.type.CardTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Entity
@Table(name = "cards")
@Getter
public class Card {

    protected Card() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "card_id", nullable = false)
    private Long id;

    /**
     * 카드 코드
     */
    @Column(name = "code", nullable = false, length = 4)
    private String code;

    /**
     * 카드 이름
     */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /**
     * 카드 효과 설명
     */
    @Column(name = "description", length = 1000)
    private String description;

    /**
     * 카드 속성
     */
    @Column(name = "attribute", length = 10)
    private String attribute;

    /**
     * 카드 등급
     *
     * P: Platinum
     * G: Gold
     * S: Silver
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "tier", length = 1)
    private CardTier tier;

    /**
     * 카드 카테고리
     */
    @Column(name = "category")
    private Integer category;

    /**
     * 카드 효과 지속 시간
     */
    @Column(name = "duration")
    private Integer duration;

    /**
     * 카드 효과 수치
     */
    @Column(name = "weight", nullable = false)
    private Integer weight;

    private Card(
            String code,
            String name,
            String description,
            String attribute,
            CardTier tier,
            Integer category,
            Integer duration,
            Integer weight) {
        this.code = code;
        this.name = name;
        this.description = description;
        this.attribute = attribute;
        this.tier = tier;
        this.category = category;
        this.duration = duration;
        this.weight = weight;
    }

    public static Card create(
            String code,
            String name,
            String description,
            String attribute,
            CardTier tier,
            Integer category,
            Integer duration,
            Integer weight) {
        return new Card(
                code,
                name,
                description,
                attribute,
                tier,
                category,
                duration,
                weight);
    }
}